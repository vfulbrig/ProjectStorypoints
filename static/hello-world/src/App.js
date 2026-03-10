import React, { useState, useEffect } from "react";
import { view, invoke } from "@forge/bridge";
import { Line } from "react-chartjs-2";

import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Legend
);

function App() {
  const [projectKey, setProjectKey] = useState("");
  const [boards, setBoards] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [selectedSprint, setSelectedSprint] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [issues, setIssues] = useState([]);
  const [projectIssues, setProjectIssues] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  const storyPointsField = "customfield_10106";

  /* ---------------- Jira Context ---------------- */
  async function getProjectKey() {
    const context = await view.getContext();
    return context.extension.project.key;
  }

  /* ---------------- API calls ---------------- */
  async function getBoards(projectKey) {
    return await invoke("getBoards", { projectKey });
  }

  async function getSprints(boardId) {
    return await invoke("getSprints", { boardId });
  }

  async function getIssues(sprintId) {
    return await invoke("getIssues", { sprintId });
  }

  async function getAnalytics(projectKey, sprintId) {
    return await invoke("getBurnAnalytics", { projectKey, sprintId });
  }

  /* ---------------- Helpers ---------------- */
  function stripTime(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getSprintDates(sprint) {
    if (!sprint?.startDate) return [];
    const start = stripTime(sprint.startDate);
    const end = stripTime(sprint.endDate || new Date());
    const dates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d));
    }
    return dates;
  }

  function buildProjectTimeline(issues, spField) {
    const events = [];

    issues.forEach((issue) => {
      const created = new Date(issue.fields.created);
      const sp = issue.fields?.[spField] || 0;

      events.push({ date: created, type: "add", value: sp });

      issue.changelog?.histories?.forEach((h) => {
        const date = new Date(h.created);
        h.items.forEach((item) => {
          if (item.field === "Story Points") {
            const oldVal = Number(item.fromString) || 0;
            const newVal = Number(item.toString) || 0;
            events.push({ date, type: "sp-change", value: newVal - oldVal });
          }
          if (item.field === "status" && item.toString === "Done") {
            events.push({ date, type: "complete", value: sp });
          }
          if (item.field === "status" && item.fromString === "Done") {
            events.push({ date, type: "reopen", value: sp });
          }
        });
      });
    });

    return events.sort((a, b) => a.date - b.date);
  }

  function computeBurndown(issues, spField) {
    if (!issues.length) return { labels: [], data: [] };
    const timeline = buildProjectTimeline(issues, spField);

    const start = new Date(Math.min(...issues.map((i) => new Date(i.fields.created))));
    const end = new Date();

    const labels = [];
    const data = [];

    let remainingPoints = 0;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      timeline
        .filter((e) => new Date(e.date).toDateString() === d.toDateString())
        .forEach((e) => {
          if (e.type === "add" || e.type === "sp-change") remainingPoints += e.value;
          if (e.type === "complete") remainingPoints -= e.value;
          if (e.type === "reopen") remainingPoints += e.value;
        });
      labels.push(d.toISOString().split("T")[0]);
      data.push(Math.max(remainingPoints, 0));
    }

    return { labels, data };
  }

  /* ---------------- Init project ---------------- */
  useEffect(() => {
    async function init() {
      const key = await getProjectKey();
      setProjectKey(key);

      const boardList = await getBoards(key);
      setBoards(boardList);

      if (boardList.length) {
        const sprintList = await getSprints(boardList[0].id);
        setSprints(sprintList);
        if (sprintList.length) setSelectedSprint(sprintList[0].id.toString());
      }
    }
    init();
  }, []);

  /* ---------------- Load sprint data ---------------- */
  useEffect(() => {
    if (!selectedSprint) return;

    async function loadData() {
      const sprintIssues = await getIssues(selectedSprint);
      setIssues(sprintIssues);

      const projectAll = await invoke("getIssues", { projectKey });
      setProjectIssues(projectAll);

      const data = await getAnalytics(projectKey, selectedSprint);
      setAnalytics(data);

      if (data?.memberBurnSprint) {
        const users = Object.keys(data.memberBurnSprint);
        if (users.length && !selectedUser) setSelectedUser(users[0]);
      }
    }

    loadData();
  }, [selectedSprint, projectKey]);

  /* ---------------- Project Burndown Chart ---------------- */
  const projectSeries = computeBurndown(projectIssues, storyPointsField);
  const projectBurndownChart = {
    labels: projectSeries.labels,
    datasets: [
      {
        label: "Project Remaining Story Points",
        data: projectSeries.data,
        borderColor: "rgb(54,162,235)",
        tension: 0.3
      }
    ]
  };

  /* ---------------- Sprint Burndown (Team) ---------------- */
  const sprintDates = getSprintDates(sprints.find((s) => s.id.toString() === selectedSprint));
  const teamBurndownChart = analytics
    ? {
        labels: sprintDates.map((d) => d.toISOString().split("T")[0]),
        datasets: [
          {
            label: "Team Sprint Burndown",
            data: sprintDates.map((_, i) => {
              const total = Object.values(analytics.memberBurnSprint || {}).reduce((a, b) => a + b, 0);
              const ideal = analytics.teamAverageSprintBurn || 0;
              return Math.max(total - (i * total) / (sprintDates.length - 1), 0);
            }),
            borderColor: "rgb(255,99,132)",
            tension: 0.3
          }
        ]
      }
    : null;

  /* ---------------- Developer Burndown ---------------- */
  const developerBurndownChart = analytics && selectedUser
    ? {
        labels: sprintDates.map((d) => d.toISOString().split("T")[0]),
        datasets: [
          {
            label: selectedUser,
            data: sprintDates.map((_, i) => {
              const total = analytics.memberBurnSprint[selectedUser] || 0;
              const avg = analytics.memberAverageSprintBurn[selectedUser] || 0;
              return Math.max(total - (i * total) / (sprintDates.length - 1), 0);
            }),
            borderColor: "rgb(75,192,192)",
            tension: 0.3
          }
        ]
      }
    : null;

  /* ---------------- UI ---------------- */
  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h2>Project Analytics Dashboard</h2>
      <p><b>Project:</b> {projectKey}</p>

      {/* Project Burndown */}
      <h3>Project Burndown</h3>
      {projectBurndownChart && <div style={{ width: "750px" }}><Line data={projectBurndownChart} /></div>}

      <br/>

      {/* Sprint selector below project burndown */}
      {sprints.length > 0 && (
        <div>
          <label><b>Select Sprint:</b></label><br/>
          <select value={selectedSprint} onChange={(e) => setSelectedSprint(e.target.value)}>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      <br/>

      {/* Team Sprint Burndown */}
      <h3>Team Sprint Burndown</h3>
      {teamBurndownChart && <div style={{ width: "750px" }}><Line data={teamBurndownChart} /></div>}

      <br/>

      {/* Developer Burndown */}
      <h3>Developer Burndown</h3>
      {analytics?.memberBurnSprint && (
        <div>
          <label><b>Select Developer:</b></label><br/>
          <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}>
            {Object.keys(analytics.memberBurnSprint).map((user) => (
              <option key={user} value={user}>{user}</option>
            ))}
          </select>
        </div>
      )}
      {developerBurndownChart && <div style={{ width: "750px" }}><Line data={developerBurndownChart} /></div>}
    </div>
  );
}

export default App;