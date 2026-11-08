#!/usr/bin/env bash
# Source this to run the Node version pinned in .nvmrc when the system Node differs.
# Uses nvm-windows' install folder ($NVM_HOME/v<version>) or nvm's ($NVM_DIR/versions/node/v<version>).
_root="$(git rev-parse --show-toplevel)"
_want="$(tr -d '[:space:]' < "$_root/.nvmrc")"
if [ "$(node --version 2>/dev/null)" != "v${_want}" ]; then
  _nvm_home="${NVM_HOME:-}"
command -v cygpath >/dev/null 2>&1 && [ -n "$_nvm_home" ] && _nvm_home="$(cygpath -u "$_nvm_home")"
for _dir in "${_nvm_home}/v${_want}" "${NVM_DIR:-$HOME/.nvm}/versions/node/v${_want}/bin"; do
    if [ -x "${_dir}/node" ] || [ -x "${_dir}/node.exe" ]; then export PATH="${_dir}:${PATH}"; break; fi
  done
fi
[ "$(node --version 2>/dev/null)" = "v${_want}" ] || { echo "Node v${_want} not found; run: nvm install ${_want}" >&2; return 1 2>/dev/null || exit 1; }
unset _root _want _dir _nvm_home
