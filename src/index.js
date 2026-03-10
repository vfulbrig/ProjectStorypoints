import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();

// --- Utility: call Jira API as app ---
async function callJiraAsApp(url) {
  try {
    const response = await api.asApp().requestJira(url);
    const text = await response.text(); // read body only once

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

// --- Utility: call Jira API as current user ---
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

// --- Get issues by projectKey or sprintId ---
resolver.define("getIssues", async ({ payload }) => {
  const { projectKey, sprintId } = payload;
  let url;
  let data;

  if (sprintId) {
    // Always fetch changelog for accurate burndown
    url = route`/rest/agile/1.0/sprint/${sprintId}/issue?fields=summary,status,customfield_10106&expand=changelog`;
    data = await callJiraAsApp(url);
    return data?.issues || [];
  } else if (projectKey) {
    url = route`/rest/api/3/search/jql?jql=project=${projectKey}&fields=summary,status,customfield_10106&expand=changelog`;
    data = await callJiraAsApp(url);

    // Retry as user if app cannot see all issues
    if (!data) {
      console.log("Retrying getIssues as user due to app visibility issues...");
      data = await callJiraAsUser(url);
    }

    return data?.issues || [];
  }

  return [];
});

// --- Get boards by projectKey ---
resolver.define("getBoards", async ({ payload }) => {
  const { projectKey } = payload;
  const url = route`/rest/agile/1.0/board?projectKeyOrId=${projectKey}&type=scrum`;

  const data = await callJiraAsApp(url);
  return data?.values || [];
});

// --- Get sprints by boardId ---
resolver.define("getSprints", async ({ payload }) => {
  const { boardId } = payload;
  const url = route`/rest/agile/1.0/board/${boardId}/sprint`;

  const data = await callJiraAsApp(url);

  // Sort sprints by startDate for consistent dropdown
  const sprints = (data?.values || []).sort((a, b) => {
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return new Date(a.startDate) - new Date(b.startDate);
  });

  return sprints;
});

// --- Simple test endpoint ---
resolver.define("getText", (req) => {
  console.log(req);
  return "Hello world!";
});

export const handler = resolver.getDefinitions();