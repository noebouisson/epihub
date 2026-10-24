#!/bin/bash
# Script exécuté par le paquet .deb après la désinstallation.

if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove 'epihub' '/usr/bin/epihub'
else
    rm -f '/usr/bin/epihub'
fi

if [ -f /etc/apparmor.d/epihub ]; then
    if command -v apparmor_parser >/dev/null 2>&1; then
        apparmor_parser -R /etc/apparmor.d/epihub 2>/dev/null || true
    fi
    rm -f /etc/apparmor.d/epihub
fi
