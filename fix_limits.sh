#!/bin/bash
# This script configures macOS to increase the system-wide limit on open files.

cat <<EOF | sudo tee /Library/LaunchDaemons/limit.maxfiles.plist > /dev/null
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>limit.maxfiles</string>
    <key>ProgramArguments</key>
    <array>
      <string>launchctl</string>
      <string>limit</string>
      <string>maxfiles</string>
      <string>65536</string>
      <string>1048576</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>ServiceIPC</key>
    <false/>
  </dict>
</plist>
EOF

# Set the correct ownership and permissions for the new file
sudo chown root:wheel /Library/LaunchDaemons/limit.maxfiles.plist
sudo chmod 644 /Library/LaunchDaemons/limit.maxfiles.plist

echo "✅ System file limits configuration has been created."
echo "‼️ IMPORTANT: Please REBOOT your computer now for the changes to take effect."
echo "After rebooting, you can verify the new limits by running 'launchctl limit maxfiles' in the terminal." 