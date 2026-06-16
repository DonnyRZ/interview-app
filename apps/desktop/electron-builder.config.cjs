const path = require("node:path");

module.exports = {
  appId: "com.orviko.desktop",
  productName: "Orviko",
  electronVersion: "34.5.8",
  protocols: [
    {
      name: "Orviko Auth",
      schemes: ["orviko"]
    }
  ],
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
