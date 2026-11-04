#!/bin/sh
# Installs meili, the Meilisearch CLI, from the archives of its GitHub releases.
#
#   curl -fsSL https://raw.githubusercontent.com/meilisearch/cli/main/scripts/install.sh | sh
#
# The archive holds the CLI and the Node it runs on. See Install in README.md.
set -eu

repository=https://github.com/meilisearch/cli
data_dir=${XDG_DATA_HOME:-$HOME/.local/share}
bin_dir=${MEILI_CLI_INSTALL_DIR:-$HOME/.local/bin}

fail() {
  echo "meili install: $1" >&2
  exit 1
}

case $(uname -s) in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) fail "no archive for $(uname -s). Install with npm instead: npm install -g @meilisearch/cli" ;;
esac
case $(uname -m) in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) fail "no archive for $(uname -m). Install with npm instead: npm install -g @meilisearch/cli" ;;
esac
archive=meili-$os-$arch.tar.gz

if [ -n "${MEILI_CLI_VERSION:-}" ]; then
  url=$repository/releases/download/v$MEILI_CLI_VERSION
else
  url=$repository/releases/latest/download
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $url/$archive" >&2
curl -fsSL -o "$tmp/$archive" "$url/$archive" || fail "cannot download $url/$archive"
curl -fsSL -o "$tmp/SHA256SUMS" "$url/SHA256SUMS" || fail "cannot download $url/SHA256SUMS"

expected=$(grep " $archive\$" "$tmp/SHA256SUMS" | cut -d ' ' -f 1)
if command -v sha256sum >/dev/null; then
  actual=$(sha256sum "$tmp/$archive" | cut -d ' ' -f 1)
else
  actual=$(shasum -a 256 "$tmp/$archive" | cut -d ' ' -f 1)
fi
[ -n "$expected" ] && [ "$expected" = "$actual" ] || fail "the checksum of $archive does not match SHA256SUMS"

tar -xzf "$tmp/$archive" -C "$tmp"
mkdir -p "$data_dir" "$bin_dir"
rm -rf "$data_dir/meili"
mv "$tmp/meili" "$data_dir/meili"
ln -sf "$data_dir/meili/bin/meili" "$bin_dir/meili"

installed=$("$bin_dir/meili" --version) || fail "meili does not run on this system. Install with npm instead: npm install -g @meilisearch/cli"
echo "Installed $installed in $bin_dir/meili" >&2
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) echo "$bin_dir is not in your PATH. Add this line to your shell profile: export PATH=\"$bin_dir:\$PATH\"" >&2 ;;
esac
