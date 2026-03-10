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

  // --- State variables ---
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

  // --- Effects ---

  // 1️⃣ Load project key and initial issues
  useEffect(() => {
    async function initProject() {

      const key = await getProjectKey();
      setProjectKey(key);

      const projectIssueList = await loadProjectIssues(key);
      setIssues(projectIssueList);

    }

    initProject();
  }, []);

  // 2️⃣ Load boards + sprints
  useEffect(() => {

    if (!projectKey) return;

    async function initBoardsAndSprints() {

      const boardList = await getBoards(projectKey);
      setBoards(boardList);

      if (boardList.length > 0) {

        const firstBoardId = boardList[0].id;
        setSelectedBoard(firstBoardId);

        const sprintList = await getSprints(firstBoardId);
		sprintList.sort((a, b) => {
		  if (!a.startDate) return 1; // put sprints without startDate at the end
		  if (!b.startDate) return -1;
		  return new Date(a.startDate) - new Date(b.startDate);
		});
        setSprints(sprintList);

      }

    }

    initBoardsAndSprints();

  }, [projectKey]);

  // 3️⃣ Load issues when sprint changes
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

  const chartData = {
    labels: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"],
    datasets: [
      {
        label: "Story Points Remaining",
        data: [
          totalStoryPoints,
          totalStoryPoints * 0.8,
          totalStoryPoints * 0.5,
          totalStoryPoints * 0.3,
          0
        ],
        borderColor: "rgb(54, 162, 235)",
        backgroundColor: "rgba(54, 162, 235, 0.2)",
        tension: 0.3
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: "top"
      },
      title: {
        display: true,
        text: "Sprint Burndown"
      }
    }
  };

  // --- Render ---
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