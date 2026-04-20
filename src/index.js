import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();
const STORY_POINTS_FIELD = "customfield_10106";
const SPRINT_FIELD = "customfield_10020";


async function callJiraAsApp(url) {
  try {
    const response = await api.asApp().requestJira(url);
    const text = await response.text();

    if (!response.ok) {
      console.error("Jira API error:", text);
      return null;
    }

    return JSON.parse(text);

  } catch (err) {
    console.error("Exception calling Jira API:", err);
    return null;
  }
}

async function callJiraAsUser(url) {
  try {
    const response = await api.asUser().requestJira(url);
    const text = await response.text();

    if (!response.ok) {
      console.error("Jira API asUser error:", text);
      return null;
    }

    return JSON.parse(text);

  } catch (err) {
    console.error("Exception calling Jira API asUser:", err);
    return null;
  }
}



async function fetchAllProjectIssues(projectKey) {
  let startAt = 0;
  const maxResults = 100;
  let issues = [];
  let total = 0;

  do {
    const url = route`/rest/api/3/search/jql?jql=project="${projectKey}"&startAt=${startAt}&maxResults=${maxResults}&fields=summary,status,assignee,fixVersions,created,resolutiondate,${STORY_POINTS_FIELD},customfield_10020&expand=changelog`;
    let data = await callJiraAsApp(url);
    if (!data) {
      data = await callJiraAsUser(url);
    }
    if (!data) break;

    issues = issues.concat(data.issues);
    total = data.total;
    startAt += maxResults;

  } while (startAt < total);

  return issues;
}



function extractBurnEvents(issues, sprintId = null) {
  const events = [];

  issues.forEach(issue => {
    const sp = issue.fields?.[STORY_POINTS_FIELD];
    if (sp == null) return;

    const assignee = issue.fields?.assignee?.displayName;
    if (!assignee) return; 


    const sprintField = issue.fields?.[SPRINT_FIELD] || [];


    const sprints = Array.isArray(sprintField) ? sprintField : [sprintField];

    const sprintIds = sprints.map(s => s.id);


    if (sprintIds.length === 0) return;

    if (sprintId && !sprintIds.includes(sprintId)) return;

   
    let doneDate = null;
    issue.changelog?.histories?.forEach(history => {
      history.items.forEach(item => {
        if (item.field === "status" && item.toString === "Done") {
          if (!doneDate || new Date(history.created) < new Date(doneDate)) {
            doneDate = history.created;
          }
        }
      });
    });

   
    if (doneDate) {
      events.push({
        issueKey: issue.key,
        assignee,               
        storyPoints: sp,
        sprintId: sprintId || sprintIds[0],
        completedDate: doneDate
      });
    }
  });

  return events;
}



function getAllAssignees(issues) {
  const set = new Set();

  issues.forEach(issue => {
    const name = issue.fields?.assignee?.displayName;
    if (name) set.add(name);
  });

  return Array.from(set);
}



function memberAverageBurnPerSprint(events) {
  const map = {};
  events.forEach(e => {
    if (!map[e.assignee]) map[e.assignee] = { total: 0, sprints: new Set() };
    map[e.assignee].total += e.storyPoints;
    if (e.sprintId) map[e.assignee].sprints.add(e.sprintId);
  });

  const result = {};
  Object.keys(map).forEach(member => {
    result[member] = map[member].sprints.size > 0
      ? map[member].total / map[member].sprints.size
      : 0;
  });

  return result;
}

function teamAverageBurnPerSprint(events) {
  const sprintTotals = {};
  events.forEach(e => {
    if (!e.sprintId) return;
    if (!sprintTotals[e.sprintId]) sprintTotals[e.sprintId] = 0;
    sprintTotals[e.sprintId] += e.storyPoints;
  });

  const total = Object.values(sprintTotals).reduce((a,b)=>a+b,0);
  return Object.keys(sprintTotals).length ? total / Object.keys(sprintTotals).length : 0;
}

function memberBurnAllTime(events) {
  const totals = {};
  events.forEach(e => {
    if (!totals[e.assignee]) totals[e.assignee] = 0;
    totals[e.assignee] += e.storyPoints;
  });
  return totals;
}

function teamBurnAllTime(events) {
  return events.reduce((sum,e)=>sum+e.storyPoints,0);
}

function memberBurnForSprint(events, sprintId) {
  const totals = {};
  events.filter(e=>e.sprintId===sprintId).forEach(e=>{
    if (!totals[e.assignee]) totals[e.assignee]=0;
    totals[e.assignee] += e.storyPoints;
  });
  return totals;
}

function filterByMilestone(events, issues, milestone) {
  const milestoneIssues = issues.filter(issue =>
    issue.fields.fixVersions?.some(v=>v.name===milestone)
  ).map(issue=>issue.key);

  return events.filter(e=>milestoneIssues.includes(e.issueKey));
}



resolver.define("getIssues", async ({ payload }) => {
  const { projectKey, sprintId } = payload;
  if (sprintId) {
    const url = route`/rest/agile/1.0/sprint/${sprintId}/issue?fields=summary,status,assignee,fixVersions,created,resolutiondate,${STORY_POINTS_FIELD},customfield_10020&expand=changelog&maxResults=100`;
    const data = await callJiraAsApp(url);
    return data?.issues || [];
  }
  if (projectKey) return await fetchAllProjectIssues(projectKey);
  return [];
});

resolver.define("getBoards", async ({ payload }) => {
  const { projectKey } = payload;
  const url = route`/rest/agile/1.0/board?projectKeyOrId=${projectKey}&type=scrum`;
  const data = await callJiraAsApp(url);
  return data?.values || [];
});

resolver.define("getSprints", async ({ payload }) => {
  const { boardId } = payload;
  const url = route`/rest/agile/1.0/board/${boardId}/sprint`;
  const data = await callJiraAsApp(url);
  const sprints = (data?.values||[]).sort((a,b)=>{
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return new Date(a.startDate)-new Date(b.startDate);
  });
  return sprints;
});



resolver.define("getBurnAnalytics", async ({ payload }) => {
  const { projectKey, sprintId, milestone } = payload;

  const issues = await fetchAllProjectIssues(projectKey);

  let events = extractBurnEvents(issues, sprintId);

  

  if (milestone) events = filterByMilestone(events, issues, milestone);

  return {
    memberAverageSprintBurn: memberAverageBurnPerSprint(events),
    teamAverageSprintBurn: teamAverageBurnPerSprint(events),
    memberBurnAllTime: memberBurnAllTime(events),
    teamBurnAllTime: teamBurnAllTime(events),
    memberBurnSprint: memberBurnForSprint(events, sprintId),
	allAssignees: getAllAssignees(issues)
  };
});




export const handler = resolver.getDefinitions();