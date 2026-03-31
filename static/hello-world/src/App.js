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
  const [scope, setScope] = useState("sprint");
  const [issues, setIssues] = useState([]);
  const [projectIssues, setProjectIssues] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [devSprint, setDevSprint] = useState("");

  const [showProject, setShowProject] = useState(true);
  const [showProjectVelocity, setShowProjectVelocity] = useState(false);
  const [showDevVelocity, setShowDevVelocity] = useState(false);
  const [showFullProject, setShowFullProject] = useState(false);

  const storyPointsField = "customfield_10106";

  function stripTime(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function buildIdealBurndown(labels, totalPoints) {
    const days = labels.length;
    return labels.map((_, i) => Math.max(totalPoints - (i * totalPoints) / (days - 1), 0));
  }

  function computeBurndown(issues, spField, startDate, endDate) {
    if (!issues.length || !startDate) return { labels: [], data: [] };

    const start = new Date(startDate);
    const end = new Date(endDate || new Date());

    const labels = [];
    const data = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      let totalAdded = 0;
      let totalCompleted = 0;

      issues.forEach(issue => {
        const sp = issue.fields?.[spField] || 0;
        const created = new Date(issue.fields.created);
        const resolved = issue.fields?.resolutiondate ? new Date(issue.fields.resolutiondate) : null;

        if (created <= d) totalAdded += sp;
        if (resolved && resolved <= d) totalCompleted += sp;
      });

      labels.push(d.toISOString().split("T")[0]);
      data.push(Math.max(totalAdded - totalCompleted, 0));
    }

    return { labels, data };
  }

  function computeVelocity(data) {
    const velocity = [];
    for (let i = 1; i < data.length; i++) {
      velocity.push(data[i - 1] - data[i]);
    }
    return [0, ...velocity];
  }

  /* ---------------- Init & Load ---------------- */
  useEffect(() => {
    async function init() {
      const key = await getProjectKey();
      setProjectKey(key);

      const boardList = await getBoards(key);
      setBoards(boardList);

      if (boardList.length) {
        const sprintList = await getSprints(boardList[0].id);
        setSprints(sprintList);
        if (sprintList.length) {
          setSelectedSprint(sprintList[0].id.toString());
          setDevSprint(sprintList[0].id.toString());
        }
      }
    }
    init();
  }, []);

  async function getProjectKey() {
    const context = await view.getContext();
    return context.extension.project.key;
  }

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

  useEffect(() => {
    if (!selectedSprint) return;

    async function loadData() {
      const sprintIssues = await getIssues(selectedSprint);
      setIssues(sprintIssues);

      const projectAll = await invoke("getIssues", { projectKey });
      setProjectIssues(projectAll);

      const data = await getAnalytics(projectKey, scope === "sprint" ? devSprint : undefined);
      setAnalytics(data);

      if (data?.allAssignees && !selectedUser) {
        const topUser = Object.entries(data.memberBurnAllTime || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
        setSelectedUser(topUser || data.allAssignees[0]);
      }
    }

    loadData();
  }, [selectedSprint, projectKey, devSprint, scope]);

  /* ---------------- Build Chart ---------------- */
  const activeSprint = sprints.find(s => s.id.toString() === selectedSprint);


  const devIssues = selectedUser
    ? issues.filter(issue => issue.fields?.assignee?.displayName === selectedUser)
    : issues;


  const sprintStart = activeSprint?.startDate;
  const sprintEnd = activeSprint?.endDate || new Date();

  const devBurndown = computeBurndown(devIssues, storyPointsField, sprintStart, sprintEnd);
  const devTotalPoints = devIssues.reduce((sum, i) => sum + (i.fields?.[storyPointsField] || 0), 0);
  const idealDev = buildIdealBurndown(devBurndown.labels, devTotalPoints);

  const sprintProjectBurndown = computeBurndown(issues, storyPointsField, sprintStart, sprintEnd);
  const devVelocity = computeVelocity(devBurndown.data);
  const projectVelocity = computeVelocity(sprintProjectBurndown.data);


  const firstSprintStart = sprints.length
    ? sprints.reduce((min, s) => new Date(s.startDate) < new Date(min) ? s.startDate : min, sprints[0].startDate)
    : null;

  const fullProjectBurndown = computeBurndown(projectIssues, storyPointsField, firstSprintStart, new Date());

  const fullLabels = fullProjectBurndown.labels;
	const sprintDataMapped = fullLabels.map(label => {
	  const idx = sprintProjectBurndown.labels.indexOf(label);
	  return idx !== -1 ? sprintProjectBurndown.data[idx] : null;
	});

  const datasets = [
    {
      label: selectedUser ? `${selectedUser} Remaining` : "Developer Remaining",
      data: devBurndown.data,
      borderColor: "rgb(54,162,235)",
      tension: 0.3
    },
    {
      label: "Ideal Burndown",
      data: idealDev,
      borderColor: "rgb(255,99,132)",
      borderDash: [5, 5],
      tension: 0.3
    },
    showProject && {
      label: "Sprint Project Remaining",
      data: sprintDataMapped,
      borderColor: "rgb(0,200,100)",
      tension: 0.3
    },
    showProjectVelocity && {
      label: "Project Avg Velocity",
      data: projectVelocity,
      borderColor: "rgb(255,165,0)",
      borderDash: [3, 3],
      tension: 0.3
    },
    showDevVelocity && {
      label: "Developer Avg Velocity",
      data: devVelocity,
      borderColor: "rgb(128,0,128)",
      borderDash: [3, 3],
      tension: 0.3
    },
    showFullProject && {
      label: "Full Project Burndown",
      data: fullProjectBurndown.data,
      borderColor: "rgb(0,0,0)",
      borderDash: [2, 2],
      tension: 0.3
    }
  ].filter(Boolean);

  const chartData = {
    labels: fullLabels,
    datasets
  };

  /* ---------------- UI ---------------- */
  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h2>Project Analytics Dashboard</h2>
      <p><b>Project:</b> {projectKey}</p>

      <div style={{ marginBottom: "20px" }}>
        <label><b>Assignee:</b> </label>
        <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}>
          <option value="">All Users</option>
          {analytics?.allAssignees?.map(user => (
            <option key={user} value={user}>{user}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label><b>Sprint:</b> </label>
        <select value={selectedSprint} onChange={(e) => setSelectedSprint(e.target.value)}>
          {sprints.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label><input type="checkbox" checked={showProject} onChange={() => setShowProject(!showProject)} /> Show Sprint Burndown</label><br/>
        <label><input type="checkbox" checked={showProjectVelocity} onChange={() => setShowProjectVelocity(!showProjectVelocity)} /> Show Project Velocity</label><br/>
        <label><input type="checkbox" checked={showDevVelocity} onChange={() => setShowDevVelocity(!showDevVelocity)} /> Show Developer Velocity</label><br/>
        <label><input type="checkbox" checked={showFullProject} onChange={() => setShowFullProject(!showFullProject)} /> Show Full Project Burndown</label>
      </div>

      <h3>Burndown Chart</h3><br/>
      <div style={{ width: "900px" }}>
        <Line data={chartData} />
      </div>
    </div>
  );
}

export default App;