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
  const [issues, setIssues] = useState([]);
  const [boards, setBoards] = useState([]);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [sprints, setSprints] = useState([]);
  const [selectedSprint, setSelectedSprint] = useState("");

  const storyPointsField = "customfield_10106";

  // --- Helper functions ---
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

  async function loadProjectIssues(key) {
    return await invoke("getIssues", { projectKey: key });
  }

  async function loadSprintIssues(sprintId) {
    return await invoke("getIssues", { sprintId });
  }

  function stripTime(date) {
    if (!date) return null;
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getSprintDates(sprint) {
    if (!sprint?.startDate || !sprint?.endDate) return [];
    const start = stripTime(sprint.startDate);
    const end = stripTime(sprint.endDate);
    const dates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d));
    }
    return dates;
  }

  function computeActualBurndown(issues, sprintDates) {
    return sprintDates.map(date => {
      let remaining = 0;

      issues.forEach(issue => {
        const sp = issue.fields?.[storyPointsField] || 0;

        // Get Done transitions using statusCategory
        const doneTransitions = issue.changelog?.histories?.flatMap(h => h.items)
          .filter(item => item.field === "status" && item.toStatus?.statusCategory?.key === "done")
          .map(item => stripTime(item.created))
          .filter(Boolean);

        const firstDoneDate = doneTransitions?.length
          ? doneTransitions.sort((a, b) => a.getTime() - b.getTime())[0]
          : null;

        if (!firstDoneDate || firstDoneDate > date) {
          remaining += sp;
        }
      });

      return remaining;
    });
  }

  // --- Effects ---

  // Load project key & initial issues
  useEffect(() => {
    async function initProject() {
      const key = await getProjectKey();
      setProjectKey(key);

      const projectIssueList = await loadProjectIssues(key);
      setIssues(projectIssueList);
    }
    initProject();
  }, []);

  // Load boards + sprints
  useEffect(() => {
    if (!projectKey) return;

    async function initBoardsAndSprints() {
      const boardList = await getBoards(projectKey);
      setBoards(boardList);

      if (boardList.length > 0) {
        const firstBoardId = boardList[0].id;
        setSelectedBoard(firstBoardId);

        let sprintList = await getSprints(firstBoardId);
        sprintList.sort((a, b) => {
          if (!a.startDate) return 1;
          if (!b.startDate) return -1;
          return new Date(a.startDate) - new Date(b.startDate);
        });

        setSprints(sprintList);
        if (sprintList.length > 0) {
          setSelectedSprint(sprintList[0].id.toString());
        }
      }
    }

    initBoardsAndSprints();
  }, [projectKey]);

  // Load issues when sprint changes
  useEffect(() => {
    if (!selectedSprint) return;

    async function fetchSprintIssues() {
      const sprintIssueList = await loadSprintIssues(selectedSprint);
      setIssues(sprintIssueList);
    }

    fetchSprintIssues();
  }, [selectedSprint]);

  // --- Compute burndown data ---
  const totalStoryPoints = issues.reduce(
    (sum, issue) => sum + (issue.fields?.[storyPointsField] || 0),
    0
  );

  const currentSprint = sprints.find(s => s.id.toString() === selectedSprint);
  const sprintDates = getSprintDates(currentSprint).filter(d => {
    const day = d.getDay();
    return day !== 0 && day !== 6; // skip weekends
  });

  const labels = sprintDates.map(d => d.toISOString().split("T")[0]);

  const idealData = sprintDates.map((_, i) =>
    totalStoryPoints * (1 - i / (sprintDates.length - 1))
  );

  const actualData = computeActualBurndown(issues, sprintDates);

  // Debug logs
  console.log("Labels:", labels);
  console.log("Ideal data:", idealData);
  console.log("Actual data:", actualData);
  issues.forEach(issue => {
    console.log(issue.key, "SP:", issue.fields?.[storyPointsField], "Done transitions:", issue.changelog?.histories?.map(h => h.items));
  });

  const chartData = {
    labels,
    datasets: [
      {
        label: "Actual Story Points Remaining",
        data: actualData,
        borderColor: "rgb(54, 162, 235)",
        backgroundColor: "rgba(54, 162, 235, 0.2)",
        tension: 0.3
      },
      {
        label: "Ideal Burndown",
        data: idealData,
        borderColor: "rgb(255, 99, 132)",
        borderDash: [5, 5],
        fill: false
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: "top" },
      title: { display: true, text: "Sprint Burndown" }
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h2>Jira Sprint Burndown</h2>

      <p><b>Project:</b> {projectKey}</p>
      <p><b>Number of issues:</b> {issues.length}</p>

      {sprints.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <label><b>Select Sprint:</b></label>
          <br />
          <select
            value={selectedSprint}
            onChange={(e) => setSelectedSprint(e.target.value)}
          >
            <option value="">-- Select a Sprint --</option>
            {sprints.map((sprint) => (
              <option key={sprint.id} value={sprint.id}>
                {sprint.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {issues.length > 0 && (
        <div style={{ width: "700px" }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      )}
    </div>
  );
}

export default App;