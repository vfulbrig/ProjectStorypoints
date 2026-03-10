import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();

/*
Trying to get issues here!
*/
resolver.define("getIssues", async ({ payload }) => {
  const { projectKey, sprintId } = payload; // accept sprintId optionally

  let response;

  if (sprintId) {
    // Fetch issues for a sprint
    response = await api.asApp().requestJira(
      route`/rest/agile/1.0/sprint/${sprintId}/issue?fields=summary,status,customfield_10106&expand=changelog`
    );
  } else if (projectKey) {
    // Fetch issues for a project (Jira standard search)
    response = await api.asApp().requestJira(
      route`/rest/api/3/search/jql?jql=project=${projectKey}&fields=summary,status,customfield_10106&expand=changelog`
    );

  } else {
    // If neither is provided, return empty
    return [];
  }
  if (!response.ok) {
  	  text = await response.text();
	  console.error("Jira API error:", text);
	  throw new Error(`Jira request failed: ${response.status}`);
  }

  const data = await response.json();

  console.log("Full Jira response:", data);

  // Return issues safely
  return data.issues || [];
});

resolver.define("getBoards", async ({ payload }) => {
  const { projectKey } = payload;

  const response = await api.asApp().requestJira(
    route`/rest/agile/1.0/board?projectKeyOrId=${projectKey}&type=scrum`
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("getBoards Jira API error:", error);
    return [];
  }

  const data = await response.json();
  return data.values || [];
});

// --- NEW: getSprints resolver ---
resolver.define("getSprints", async ({ payload }) => {
  const { boardId } = payload;

  const response = await api.asApp().requestJira(
    route`/rest/agile/1.0/board/${boardId}/sprint`
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("getSprints Jira API error:", error);
    return [];
  }

  const data = await response.json();
  return data.values || [];
});

resolver.define('getText', (req) => {
  console.log(req);
  return 'Hello world!';
});

export const handler = resolver.getDefinitions();