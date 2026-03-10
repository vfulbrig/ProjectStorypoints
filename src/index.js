import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();

/*
Trying to get issues here!
*/
resolver.define("getIssues", async ({ payload }) => {

  console.log("Payload received:", payload);

  const projectKey = payload.projectKey;

  const response = await api.asApp().requestJira(
    route`/rest/api/3/search?jql=project=${projectKey}`
  );

  const data = await response.json();

  console.log("Jira returned:", data.issues.length, "issues");

  return data.issues;
});

resolver.define('getText', (req) => {
    console.log(req);

    return 'Hello world!';
});

export const handler = resolver.getDefinitions();




