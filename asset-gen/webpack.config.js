const path = require("path");
const WebpackShellPluginNext = require("webpack-shell-plugin-next");

module.exports = {
  entry: "./src/stardew-main.tsx",
  devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  output: {
    filename: "stardew-main.js",
    path: path.resolve(__dirname, "dist"),
  },
  plugins: [
    new WebpackShellPluginNext({
      onBuildStart: {
        scripts: ['echo "Webpack Start"'],
        blocking: true,
        parallel: false,
      },
      onAfterDone: {
        scripts: ["pwd", 'cp dist/stardew-main* ../static/js"'],
        blocking: true,
        parallel: false,
      },
    }),
  ],
};
