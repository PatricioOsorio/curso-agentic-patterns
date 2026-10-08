import './string-colors.js';

export const logger = {
  /** Prints a styled horizontal rule */
  separator(length = 60, char = '─'): void {
    console.log(char.repeat(length).blue);
  },

  /** Prints a prominent banner title */
  title(text: string): void {
    const width = Math.max(text.length + 6, 50);
    const border = '═'.repeat(width);
    console.log(`\n${border.blue}`);
    console.log(`   ${text.toUpperCase().yellow}`);
    console.log(`${border.blue}\n`);
  },

  /** Prints a section header with an underline */
  section(text: string): void {
    console.log(`\n◆ ${text.yellow}`);
    console.log('─'.repeat(Math.max(text.length + 4, 40)).blue);
  },

  /** Prints a labeled success message */
  success(message: string, detail?: unknown): void {
    if (detail !== undefined) {
      console.log(`  ✅ ${message.green}:`, detail);
    } else {
      console.log(`  ✅ ${message.green}`);
    }
  },

  /** Prints a labeled info message */
  info(message: string, detail?: unknown): void {
    if (detail !== undefined) {
      console.log(`  ℹ️  ${message.blue}:`, detail);
    } else {
      console.log(`  ℹ️  ${message.blue}`);
    }
  },

  /** Prints a labeled warning message */
  warn(message: string, detail?: unknown): void {
    if (detail !== undefined) {
      console.log(`  ⚠️  ${message.yellow}:`, detail);
    } else {
      console.log(`  ⚠️  ${message.yellow}`);
    }
  },

  /** Prints a labeled error message */
  error(message: string, error?: unknown): void {
    if (error !== undefined) {
      console.error(`  ❌ ${message.red}:`, error);
    } else {
      console.error(`  ❌ ${message.red}`);
    }
  },
};

/** Alias for convenient shorthand usage: log.title(), log.separator() */
export const log = logger;
