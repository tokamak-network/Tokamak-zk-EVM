const path = require('path');

module.exports = {
  target: 'node',
  mode: 'production',
  entry: './src/cli/index.ts',
  output: {
    path: path.resolve(__dirname, 'bundled'),
    filename: 'synthesizer-cli.js',
    libraryTarget: 'commonjs2',
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
    alias: {
      '@qap-compiler': path.resolve(__dirname, 'qap-compiler'),
      '@tokamak/utils': path.resolve(__dirname, 'src/tokamak/utils'),
      '@synthesizer-libs/util': path.resolve(
        __dirname,
        'node_modules/@synthesizer-libs/util/src',
      ),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
  externals: {
    // Node.js built-ins
    fs: 'commonjs fs',
    path: 'commonjs path',
    crypto: 'commonjs crypto',
    url: 'commonjs url',
    util: 'commonjs util',
    events: 'commonjs events',
    stream: 'commonjs stream',
    buffer: 'commonjs buffer',
    child_process: 'commonjs child_process',
    readline: 'commonjs readline',
    // Skip problematic modules
    fsevents: 'commonjs fsevents',
  },
  optimization: {
    minimize: false, // Keep readable for debugging
  },
  node: {
    __dirname: false,
    __filename: false,
  },
};
