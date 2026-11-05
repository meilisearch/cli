// The changelog line is the changeset text, with no commit hash (see README.md).
export default {
  getReleaseLine: (changeset) => `- ${changeset.summary.trim().replaceAll("\n", "\n  ")}`,
  getDependencyReleaseLine: () => "",
};
