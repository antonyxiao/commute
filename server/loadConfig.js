require('dotenv').config();
const config = require('./config.json');

function replacePlaceholders(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\{\{(\w+)\}\}/g, (_, key) => process.env[key] || '');
  } else if (typeof obj === 'object' && obj !== null) {
    if (Array.isArray(obj)) {
      return obj.map(replacePlaceholders);
    } else {
      const newObj = {};
      for (const key in obj) {
        newObj[key] = replacePlaceholders(obj[key]);
      }
      return newObj;
    }
  }
  return obj;
}

const processedConfig = replacePlaceholders(config);

module.exports = processedConfig;
