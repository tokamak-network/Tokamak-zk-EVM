

#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'


# Root detection for Docker/Local
if [ "$(id -u)" -eq "0" ]; then
    SUDO=""
else
    SUDO="sudo"
fi

INSTALL_DIR="/opt/icicle"

# Safety check to avoid accidental root directory deletion
if [ -z "$INSTALL_DIR" ] || [ "$INSTALL_DIR" = "/" ]; then
    echo "[ERROR] INSTALL_DIR is empty or root ('/'). Aborting."
    exit 1
fi

echo "[*] Uninstalling from $INSTALL_DIR ..."
$SUDO rm -rf "$INSTALL_DIR"/

echo "[*] Done! Icicle backend has been uninstalled from $INSTALL_DIR."
