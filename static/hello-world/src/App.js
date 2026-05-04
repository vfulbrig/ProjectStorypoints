import React, { useState, useEffect } from "react";
import { view, invoke } from "@forge/bridge";
import { Line } from "react-chartjs-2";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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
  const [selectedUser2, setSelectedUser2] = useState("");
  const [customDate, setcustomDate] = useState("");
  const [customDate2, setcustomDate2] = useState("");
  const [scope, setScope] = useState("sprint");
  const [issues, setIssues] = useState([]);
  const [projectIssues, setProjectIssues] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [devSprint, setDevSprint] = useState("");

  const [showProject, setShowProject] = useState(true);
  const [showProjectVelocity, setShowProjectVelocity] = useState(false);
  const [showDevVelocity, setShowDevVelocity] = useState(false);
  const [showFullProject, setShowFullProject] = useState(false);
  const [showDevVelocity2, setShowDevVelocity2] = useState(false);
  const [showFullProject2, setShowFullProject2] = useState(false);

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
	  
	  if (data?.allAssignees && !selectedUser2) {
        const topUser = Object.entries(data.memberBurnAllTime || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
        setSelectedUser2(topUser || data.allAssignees[0]);
      }
    }

    loadData();
  }, [selectedSprint, projectKey, devSprint, scope]);


  const activeSprint = sprints.find(s => s.id.toString() === selectedSprint);


  const devIssues = selectedUser
    ? issues.filter(issue => issue.fields?.assignee?.displayName === selectedUser)
    : issues;
	
  const devIssues2 = selectedUser2
    ? issues.filter(issue => issue.fields?.assignee?.displayName === selectedUser2)
    : issues;


  const sprintStart = activeSprint?.startDate;
  const sprintEnd = activeSprint?.endDate || new Date();
  const customStartDate = new Date("2026-02-03");
  const customEndDate = new Date("2026-03-18");

  const devBurndown = computeBurndown(devIssues, storyPointsField, sprintStart, sprintEnd);
  const devBurndown2 = computeBurndown(devIssues2, storyPointsField, customStartDate, customEndDate);
  const devTotalPoints = devIssues.reduce((sum, i) => sum + (i.fields?.[storyPointsField] || 0), 0);
  const idealDev = buildIdealBurndown(devBurndown.labels, devTotalPoints);
  const idealDev2 = buildIdealBurndown(devBurndown2.labels, devTotalPoints);

  const sprintProjectBurndown = computeBurndown(issues, storyPointsField, sprintStart, sprintEnd);
  const sprintProjectBurndown2 = computeBurndown(issues, storyPointsField, customStartDate, customEndDate);
  const devVelocity = computeVelocity(devBurndown.data);
  const devVelocity2 = computeVelocity(devBurndown2.data);
  const projectVelocity = computeVelocity(sprintProjectBurndown.data);
  const project2Velocity = computeVelocity(sprintProjectBurndown2.data);
  


  const firstSprintStart = sprints.length
    ? sprints.reduce((min, s) => new Date(s.startDate) < new Date(min) ? s.startDate : min, sprints[0].startDate)
    : null;
	
  function setCustomDates(){
	customStartDate = document.getElementById('start').value; 
	customEndDate = document.getElementById('start').value;
  }

  const fullProjectBurndown = computeBurndown(projectIssues, storyPointsField, firstSprintStart, new Date());
  const fullProjectBurndown2 = computeBurndown(projectIssues, storyPointsField, customStartDate, customEndDate);

  const fullLabels = fullProjectBurndown.labels;
	const sprintDataMapped = fullLabels.map(label => {
	  const idx = sprintProjectBurndown.labels.indexOf(label);
	  return idx !== -1 ? sprintProjectBurndown.data[idx] : null;
	});
	
  const fullLabels2 = fullProjectBurndown2.labels;
	const sprintDataMapped2 = fullLabels2.map(label => {
	  const idx = sprintProjectBurndown2.labels.indexOf(label);
	  return idx !== -1 ? sprintProjectBurndown2.data[idx] : null;
	});


  const exportPDF = async () => {
    const elements = document.querySelectorAll(".chart");

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: "a4"
    });
	
	pdf.text("Project Analytics Report", 20, 40);
    pdf.addPage();

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];

      const canvas = await html2canvas(el, {
        scale: 2 // improves quality
      });

      const imgData = canvas.toDataURL("image/png");

      const pageWidth = pdf.internal.pageSize.getWidth();
	  const margin = 20;
	  const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (i > 0) {
        pdf.addPage();
      }

      pdf.text(`Chart ${i + 1}`, 20, 20);
      pdf.addImage(imgData, "PNG", 20, 40, imgWidth, imgHeight);
    }

    pdf.save("dashboard.pdf");
  };
  
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
  const datasets2 = [
    {
      label: selectedUser2 ? `${selectedUser2} Remaining` : "Developer Remaining",
      data: devBurndown2.data,
      borderColor: "rgb(54,162,235)",
      tension: 0.3
    },
	{
      label: "Ideal Burndown",
      data: idealDev2,
      borderColor: "rgb(255,99,132)",
      borderDash: [5, 5],
      tension: 0.3
    },
  	showDevVelocity2 && {
      label: "Developer Avg Velocity",
      data: devVelocity2,
      borderColor: "rgb(128,0,128)",
      borderDash: [3, 3],
      tension: 0.3
    },
    showFullProject2 && {
      label: "Full Project Burndown",
      data: fullProjectBurndown2.data,
      borderColor: "rgb(0,0,128)",
      borderDash: [5, 3],
      tension: 0.3
    }
  ].filter(Boolean);

  const chartData = {
    labels: devBurndown.labels,
    datasets: datasets
  };
  

  const chartData2 = {
    labels: fullProjectBurndown2.labels,
    datasets: datasets2
  };


  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h2>Project Analytics Dashboard</h2>
      <p><b>Project:</b> {projectKey}</p>
	  <button onClick={exportPDF}>Export PDF</button>

      <div style={{ marginBottom: "20px" }}>
        <label><b>Assigned User:</b> </label>
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

      <h3>Sprint Burndown Chart</h3><br/>
      <div style={{ width: "900px" }} class="chart">
        <Line data={chartData} />
      </div>
	  
	  <div style={{ padding: "20px", fontFamily: "Arial" }}></div>
	  
	  <div style={{ marginBottom: "40px" }}>
        <label><b>Custom Dates:</b> </label>
		<input type="date" id="start" name="Project Start" value="2026-02-03">
		<input type="date" id="end" name="Project End" value="2026-03-16">
		<button onclick='setCustomDates()'>Submit</button>

      </div>
	  
	  <div style={{ marginBottom: "20px" }}>
        <label><b>Assigned User:</b> </label>
        <select value={selectedUser2} onChange={(e) => setSelectedUser2(e.target.value)}>
          <option value="">All Users</option>
          {analytics?.allAssignees?.map(user => (
            <option key={user} value={user}>{user}</option>
          ))}
        </select>
      </div>
	  
	  <div style={{ marginBottom: "20px" }}>
        <label><input type="checkbox" checked={showDevVelocity2} onChange={() => setShowDevVelocity2(!showDevVelocity2)} /> Show Developer Velocity</label><br/>
        <label><input type="checkbox" checked={showFullProject2} onChange={() => setShowFullProject2(!showFullProject2)} /> Show Project Burndown</label>
      </div>
	  
	  <h3>Project Burndown Chart</h3><br/>
      <div style={{ width: "900px" }} class="chart">
        <Line data={chartData2} />
      </div>
	  
    </div>
  );
}

export default App;