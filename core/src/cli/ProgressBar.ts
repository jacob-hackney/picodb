export class ProgressBar {
  command: string;

  constructor(command: string, initialMessage: string) {
    this.command = command;

    process.stdout.write("\n"); // Move to a new line for the progress bar
    this.update(0, initialMessage);
  }

  update(progressPercent: number, message: string): void {
    if(progressPercent < 0) progressPercent = 0;
    if(progressPercent > 1) progressPercent = 1;

    const completedLength = Math.round(progressPercent * 50);

    const bar = `[${"=".repeat(completedLength) + (progressPercent < 1 ? ">" : "=") + "-".repeat(50 - completedLength)}]`;
    const fullBar = `\r${this.command}: ${bar} (${Number((progressPercent * 100).toFixed(2))}%) ${message}`;

    process.stdout.write(fullBar.padEnd(150));
  }
}
