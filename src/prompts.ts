import readline from 'node:readline';

function createInterface(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function prompt(question: string): Promise<string> {
  return new Promise<string>((resolve) => {
    const rl = createInterface();
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function askForCredentials(): Promise<Record<string, string> | undefined> {
  if (!process.stdin.isTTY) {
    return undefined;
  }

  const answer = (await prompt('[Agent] Does the application need credentials (email, password, token...) for these tests? (y/N) ')).trim().toLowerCase();

  if (answer !== 'y' && answer !== 'yes') {
    return undefined;
  }

  console.log('\n[Agent] Provide the missing values. Leave a field empty to skip it.');
  console.log('[Agent] Nothing you type is written to disk or logs.\n');

  const credentials: Record<string, string> = {};

  const email = (await prompt('  Email: ')).trim();
  if (email) {
    credentials.EMAIL = email;
  }

  const password = (await prompt('  Password: ')).trim();
  if (password) {
    credentials.PASSWORD = password;
  }

  let collecting = true;
  while (collecting) {
    const extra = (await prompt('  Extra credential as KEY=value (e.g. TOKEN=abc), or empty to finish: ')).trim();
    if (!extra) {
      collecting = false;
      continue;
    }

    const separatorIndex = extra.indexOf('=');
    if (separatorIndex > 0) {
      const key = extra.slice(0, separatorIndex).trim().toUpperCase();
      const value = extra.slice(separatorIndex + 1).trim();
      if (key && value) {
        credentials[key] = value;
        continue;
      }
    }

    console.log('  [Agent] Ignoring invalid entry, expected KEY=value.');
  }

  return Object.keys(credentials).length > 0 ? credentials : undefined;
}

export function parseCredentialsArg(args: string[]): Record<string, string> | undefined {
  const arg = args.find((item) => item.startsWith('--credentials='));
  if (!arg) {
    return undefined;
  }

  const raw = arg.slice('--credentials='.length);
  const credentials: Record<string, string> = {};

  for (const pair of raw.split(',')) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex > 0) {
      const key = pair.slice(0, separatorIndex).trim().toUpperCase();
      const value = pair.slice(separatorIndex + 1).trim();
      if (key && value) {
        credentials[key] = value;
      }
    }
  }

  return Object.keys(credentials).length > 0 ? credentials : undefined;
}
