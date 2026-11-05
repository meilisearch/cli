// The changelog line is the changeset text, with no commit hash, and a link to its pull request (see README.md).
const repo = "meilisearch/cli";

async function pullRequestOf(commit) {
  const headers = process.env.GITHUB_TOKEN
    ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {};
  const response = await fetch(`https://api.github.com/repos/${repo}/commits/${commit}/pulls`, {
    headers,
  });
  if (!response.ok)
    throw new Error(`GitHub answered ${response.status} for the pull request of ${commit}`);
  return (await response.json())[0]?.number;
}

export default {
  getReleaseLine: async (changeset) => {
    const [first, ...rest] = changeset.summary.trim().split("\n");
    const number = changeset.commit && (await pullRequestOf(changeset.commit));
    const link = number ? ` ([#${number}](https://github.com/${repo}/pull/${number}))` : "";
    return [`- ${first}${link}`, ...rest.map((line) => `  ${line}`)].join("\n");
  },
  getDependencyReleaseLine: () => "",
};
