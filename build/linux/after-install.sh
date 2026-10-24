#!/bin/bash
# Script exécuté par le paquet .deb après l'installation.

# Lien /usr/bin/epihub
if type update-alternatives 2>/dev/null >&1; then
    if [ -L '/usr/bin/epihub' -a -e '/usr/bin/epihub' -a "`readlink '/usr/bin/epihub'`" != '/etc/alternatives/epihub' ]; then
        rm -f '/usr/bin/epihub'
    fi
    update-alternatives --install '/usr/bin/epihub' 'epihub' '/opt/EpiHub/epihub' 100 || ln -sf '/opt/EpiHub/epihub' '/usr/bin/epihub'
else
    ln -sf '/opt/EpiHub/epihub' '/usr/bin/epihub'
fi

# Ubuntu 23.10+ limite les espaces de noms utilisateur via AppArmor : sans profil,
# le bac à sable Chromium ne démarre pas. On installe un profil (comme pour Chrome),
# et on garde chrome-sandbox en setuid seulement si AppArmor n'est pas disponible.
if [ -d /etc/apparmor.d ] && command -v apparmor_parser >/dev/null 2>&1; then
    cat > /etc/apparmor.d/epihub <<'EOF'
abi <abi/4.0>,
include <tunables/global>

profile epihub /opt/EpiHub/epihub flags=(unconfined) {
  userns,

  include if exists <local/epihub>
}
EOF
    apparmor_parser -r /etc/apparmor.d/epihub || true
    chmod 0755 '/opt/EpiHub/chrome-sandbox' || true
else
    chmod 4755 '/opt/EpiHub/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
