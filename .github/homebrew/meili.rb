# Formula/meili.rb of meilisearch/homebrew-tap. The homebrew job of
# .github/workflows/ci.yml writes the version and the checksum, and pushes it.
class Meili < Formula
  desc "Command-line tool for Meilisearch and Meilisearch Cloud"
  homepage "https://github.com/meilisearch/cli"
  url "https://registry.npmjs.org/@meilisearch/cli/-/cli-VERSION.tgz"
  sha256 "SHA256"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/meili --version")
  end
end
