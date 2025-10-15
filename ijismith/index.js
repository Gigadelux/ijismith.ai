#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { config } from 'dotenv';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { promises as fs } from 'fs';
import path from 'path';
import readline from 'readline';
import gradient from 'gradient-string';
import os from 'os';
import inquirer from 'inquirer';

config();

const program = new Command();

// --- Model Configuration ---
const models = {
  'GPT-4.1 Mini': 'openai/gpt-4.1-mini',
  'DeepSeek Chat V3.1 (Free)': 'deepseek/deepseek-chat-v3.1:free',
  'Llama 4 Maverick (Free)': 'meta-llama/llama-4-maverick:free',
  'Gemini 2.5 Flash Lite': 'google/gemini-2.5-flash-lite',
};
const defaultConfig = { model: 'openai/gpt-4.1-mini' };
const configPath = path.join(os.homedir(), '.ijismithrc');

const readConfig = async () => {
  try {
    const config = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(config);
  } catch (error) {
    return defaultConfig;
  }
};

const writeConfig = async (config) => {
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
};

// --- Display ---
const displayTitle = () => {
  const titleArt = `
 ██╗██╗     ██╗██╗███████╗███╗   ███╗██╗████████╗██╗  ██╗
 ██║██║     ██║██║██╔════╝████╗ ████║██║╚══██╔══╝██║  ██║
 ██║██║     ██║██║███████╗██╔████╔██║██║   ██║   ███████║
 ██║██║     ██║██║╚════██║██║╚██╔╝██║██║   ██║   ██╔══██║
 ██║███████╗██║██║███████║██║ ╚═╝ ██║██║   ██║   ██║  ██║
 ╚═╝╚══════╝╚═╝╚═╝╚══════╝╚═╝     ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝
`;
  const gradientText = gradient(['#00aaff', '#ff00ff', '#8800ff'])(titleArt);
  console.log(gradientText);
  console.log(chalk.blueBright('Greetings, traveler.'));
  console.log(chalk.blueBright('I am Iji — the forger of game worlds.'));
  console.log(chalk.blueBright('🛠️ Forge your game world from a single idea.'));
  console.log(chalk.gray('Type your game idea and press Enter. Type "exit" to quit and "model" to select a model'));
};

// --- API ---
const openrouter = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
});

const generateFile = async (gameIdea, file, structure, chatHistory) => {
    console.log(chalk.blue(`\nGenerating ${file}...`));
    try {
        const config = await readConfig();
        const model = config.model || defaultConfig.model;
        const history = chatHistory.length > 0 ? `This is the history of the game ideas so far: ${chatHistory.join(', ')}.` : '';
        const prompt = `${history} Based on the game idea "${gameIdea}", generate a JSON for ${file} with the following structure: ${structure}. When an ability has no stats, the value for 'ability_stats' should be [-1].`;
        const { textStream } = await streamText({
            model: openrouter(model),
            prompt: prompt,
        });

        let fullResponse = '';
        for await (const delta of textStream) {
            process.stdout.write(delta);
            fullResponse += delta;
        }

        const cleanedResponse = fullResponse.replace(/```json|```/g, '').trim();
        console.log(chalk.green(`
Finished generating ${file}.`));
        return cleanedResponse;
    } catch (error) {
        console.error(chalk.red(`
Failed to generate ${file}`), error);
        return null;
    }
};

const generateAllFiles = async (idea, chatHistory) => {
    const gameDir = idea.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const outputDir = path.join(process.cwd(), gameDir);

    try {
        await fs.mkdir(outputDir, { recursive: true });
    } catch (error) {
        console.error(chalk.red(`Failed to create directory ${outputDir}`), error);
        return;
    }

    const filesToGenerate = ['story', 'characters', 'items', 'npcs'];

    for (const file of filesToGenerate) {
        const structurePath = path.join(process.cwd(), 'data', `${file}.json`);
        try {
            const structure = await fs.readFile(structurePath, 'utf-8');
            const generatedJson = await generateFile(idea, `${file}.json`, structure, chatHistory);
            if (generatedJson) {
                const outputPath = path.join(outputDir, `${file}.json`);
                await fs.writeFile(outputPath, generatedJson);
                console.log(chalk.cyan(`Successfully wrote ${file}.json to ${outputPath}`));
            }
        } catch (error) {
            console.error(chalk.red(`Failed to process ${file}.json`), error);
        }
    }

    console.log(chalk.bold.green(`\nGame structure for "${idea}" generated successfully in ${outputDir}`));
};

const selectModel = async () => {
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'model',
            message: 'Select an AI model:',
            choices: Object.keys(models),
        },
    ]);
    const selectedModel = models[answers.model];
    await writeConfig({ model: selectedModel });
    console.log(chalk.green(`Model set to: ${answers.model}`));
    process.stdin.ref();
};


// --- REPL ---
const startRepl = async () => {
    const chatHistory = [];
    
    const createInterface = () => {
        return readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.blue('> '),
        });
    };
    
    let rl = createInterface();
    let isSelectingModel = false;

    displayTitle();
    rl.prompt();

    const handleLine = async (line) => {
        const input = line.trim();
        const lowerInput = input.toLowerCase();

        if (lowerInput === 'exit') {
            rl.close();
        } else if (lowerInput === 'model') {
            isSelectingModel = true;
            rl.close();
            await selectModel();
            
            // Recreate the readline interface
            rl = createInterface();
            rl.on('line', handleLine);
            rl.on('close', handleClose);
            isSelectingModel = false;
            rl.prompt();
        } else if (input) {
            await generateAllFiles(input, chatHistory);
            chatHistory.push(input);
            rl.prompt();
        } else {
            rl.prompt();
        }
    };

    const handleClose = () => {
        if (!isSelectingModel) {
            console.log(chalk.yellow('Exiting ijismith. Happy game making!'));
            process.exit(0);
        }
    };

    rl.on('line', handleLine);
    rl.on('close', handleClose);
};

// --- Commander Setup ---
program
  .name('ijismith')
  .description('A CLI for brainstorming and structuring game ideas.')
  .version('1.0.0');

program
    .command('generate [gameIdea]')
    .description('Generate a new game structure from an idea.')
    .action(async (gameIdea) => {
        if (!process.env.OPENROUTER_API_KEY) {
            console.log(chalk.red('OPENROUTER_API_KEY not found. Please add it to your .env file.'));
            return;
        }
        if (gameIdea) {
            await generateAllFiles(gameIdea, []);
        } else {
           await startRepl();
        }
    });

program
    .action(() => {
        if (!process.env.OPENROUTER_API_KEY) {
            console.log(chalk.red('OPENROUTER_API_KEY not found. Please add it to your .env file.'));
            return;
        }
        startRepl();
    });

program.parse(process.argv);
