export const readFileSync = (path, options) => {
  console.log('Mock readFileSync called with:', path);
  return '';
};

export const writeFileSync = (path, data, options) => {
  console.log('Mock writeFileSync called with:', path, data);
};

export const existsSync = (path) => {
  console.log('Mock existsSync called with:', path);
  return false;
};

export const promises = {
  readFile: async (path, options) => {
    return readFileSync(path, options);
  },
  writeFile: async (path, data, options) => {
    writeFileSync(path, data, options);
  }
};

export default {
  readFileSync,
  writeFileSync,
  existsSync,
  promises
};