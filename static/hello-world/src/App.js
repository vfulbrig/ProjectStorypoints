import React, { useEffect, useState } from "react";
import { view, invoke } from "@forge/bridge";

function App() {

  // React state variables
  const [projectKey, setProjectKey] = useState("");
  const [issues, setIssues] = useState([]);

  /*
  Get the project key from Jira
  */
  async function getProjectKey() {

    const context = await view.getContext();

    return context.extension.project.key;
  }

  /*
  Load issues from the backend
  */
  async function loadIssues(key) {

    const result = await invoke("getIssues", {
      projectKey: key
    });

    return result;
  }

  /*
  Run this code when the page loads
  */
  useEffect(() => {

    async function start() {

      const key = await getProjectKey();

      console.log("Project key:", key);

      setProjectKey(key);

      const issueList = await loadIssues(key);

      console.log("Issues:", issueList);

      setIssues(issueList);
    }

    start();

  }, []);

  /*
  Render the page
  */
  return (

    <div>

      <h1>Burndown Reports</h1>

      <p>Project: {projectKey}</p>

      <p>Number of issues: {issues.length}</p>

      <h3>Issue Data</h3>

      <pre>
        {JSON.stringify(issues, null, 2)}
      </pre>

    </div>

  );
}

export default App;