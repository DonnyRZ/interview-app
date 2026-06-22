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
  artifactName: "Orviko-Setup-${version}-dev.${ext}",
  publish: [
    {
      provider: "generic",
      url: "https://dev.orviko.net/updates/windows/"
    }
  ],
  files: [
    "dist/**",
    "dist-electron/**",
    "package.json"
  ],
  extraResources: [
    {
      from: path.join("build", "icon.ico"),
      to: "icon.ico"
    },
    {
      from: path.join("native", "windows-loopback", "bin", "WasapiLoopbackProbe.exe"),
      to: path.join("native", "windows-loopback", "WasapiLoopbackProbe.exe")
    }
  ],
  asar: true,
  win: {
    icon: path.join("build", "icon.ico"),
    signAndEditExecutable: false,
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
