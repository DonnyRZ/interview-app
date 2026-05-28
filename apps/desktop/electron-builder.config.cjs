const path = require("node:path");

module.exports = {
  appId: "com.interviewapp.desktop",
  productName: "Interview App",
  electronVersion: "34.5.8",
  directories: {
    output: "release"
  },
  files: [
    "dist/**",
    "dist-electron/**",
    "package.json"
  ],
  extraResources: [
    {
      from: path.join("native", "windows-loopback", "bin", "WasapiLoopbackProbe.exe"),
      to: path.join("native", "windows-loopback", "WasapiLoopbackProbe.exe")
    }
  ],
  asar: true,
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"]
      }
    ]
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true
  }
};
