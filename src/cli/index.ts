#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
const program = new Command("picodb");

program
  .description("A CLI for picodb, a simple embedded database for Node.js")
  .version("1.0.0");

initCommand(program);

program.parse(process.argv);
