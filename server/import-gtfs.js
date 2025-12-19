const config = require('./loadConfig');

async function runImport() {
  try {
    const { default: inquirer } = await import('inquirer');
    const gtfs = await import('gtfs');

    if (!config.agencies || config.agencies.length === 0) {
      console.error('No agencies found in config.json');
      return;
    }

    const choices = config.agencies.map(agency => ({
      name: agency.name || agency.agency_key,
      value: agency.agency_key,
      checked: true 
    }));

    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedAgencies',
        message: 'Select agencies to import:',
        choices: choices,
        validate: (answer) => {
          if (answer.length < 1) {
            return 'You must choose at least one agency.';
          }
          return true;
        },
      },
    ]);

    const selectedKeys = answers.selectedAgencies;
    
    // Create a new config object with only selected agencies
    const importConfig = {
      ...config,
      agencies: config.agencies.filter(agency => selectedKeys.includes(agency.agency_key))
    };

    console.log(`Importing data for: ${selectedKeys.join(', ')}...`);
    await gtfs.importGtfs(importConfig);
    console.log('GTFS data imported successfully.');

  } catch (err) {
    console.error('Error importing GTFS data:', err);
  }
}

runImport();
