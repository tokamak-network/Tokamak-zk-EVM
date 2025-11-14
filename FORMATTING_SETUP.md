# Formatting Setup Guide

This guide helps you set up your development environment to follow the Tokamak zkEVM formatting standards.

## Quick Start

### 1. Install Dependencies

Make sure you have the necessary dependencies installed:

```bash
npm install
```

### 2. VSCode Setup (Recommended)

If you're using VSCode, the formatting will work automatically:

1. **Install Required Extensions**:
   - [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
   - [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)

2. **Reload VSCode**: The `.vscode/settings.json` file will automatically apply team settings

3. **Format on Save**: Files will auto-format when you save (Cmd+S / Ctrl+S)

### 3. Other Editors

For other editors (WebStorm, Vim, Emacs, etc.):

- Install Prettier and ESLint plugins for your editor
- Configure them to use the workspace config files
- The `.editorconfig` file will ensure basic consistency

## Manual Formatting

You can also format files manually using npm scripts:

```bash
# Format all TypeScript, JavaScript, JSON, and Markdown files
npm run format

# Check if files are formatted correctly (without changing them)
npm run format:check

# Run ESLint and auto-fix issues
npm run lint:fix
```

## Configuration Files

Our formatting setup uses these files:

- **`.prettierrc`** - Prettier formatting rules
- **`.prettierignore`** - Files to exclude from formatting
- **`.editorconfig`** - Basic editor settings (indentation, line endings)
- **`.vscode/settings.json`** - VSCode-specific settings
- **`config/monorepo-js/eslint.cjs`** - ESLint rules
- **`config/monorepo-js/prettier.config.js`** - Prettier config for monorepo packages

## Key Settings

### Prettier

- **Print Width**: 120 characters (allows for more compact code)
- **Single Quotes**: Always use single quotes for strings
- **Semicolons**: Always add semicolons
- **Trailing Commas**: Add trailing commas everywhere (better git diffs)
- **Arrow Parens**: Avoid parentheses for single-parameter arrow functions

### ESLint

- Enforces TypeScript best practices
- Checks for unused variables and imports
- Ensures consistent import ordering
- Validates code quality and patterns

## Formatting Philosophy

Read `FORMATTING_GUIDE.md` for our team's formatting philosophy. Key points:

- **Compact is good**: Don't break lines unnecessarily
- **One info = one line**: Each meaningful piece of information gets its own line
- **Trust your judgment**: These are guidelines, not rigid rules
- **Let tools handle spacing**: Focus on logic, let Prettier handle formatting

## Troubleshooting

### Format on save not working

1. Make sure Prettier extension is installed
2. Check that `editor.defaultFormatter` is set to `esbenp.prettier-vscode`
3. Reload VSCode window (Cmd+Shift+P → "Developer: Reload Window")

### Formatting conflicts between Prettier and ESLint

This shouldn't happen - our ESLint config includes `plugin:prettier/recommended` which disables conflicting rules. If you see conflicts:

1. Run `npm run lint:fix` first
2. Then run `npm run format`

### Different formatting in different folders

Some packages might have their own `prettier.config.js`. These should all inherit from the root config and only override specific settings if needed.

## Pre-commit Hooks (Optional)

If the team wants to enforce formatting before commits, we can add Husky + lint-staged:

```bash
npm install --save-dev husky lint-staged

# Add to package.json
{
  "lint-staged": {
    "*.{ts,js,json,md}": ["prettier --write", "git add"],
    "*.{ts,js}": ["eslint --fix", "git add"]
  }
}

# Initialize husky
npx husky init
npx husky add .husky/pre-commit "npx lint-staged"
```

## CI/CD Integration

You can add formatting checks to your CI pipeline:

```yaml
# Example GitHub Actions step
- name: Check formatting
  run: npm run format:check

- name: Lint code
  run: npm run lint
```

## Questions?

If you have questions about formatting or want to discuss changes to these rules, please:

1. Read `FORMATTING_GUIDE.md` first
2. Discuss in team meetings
3. Update this guide and the rules after team agreement

---

**Remember**: The goal is readable, maintainable code - not perfectly formatted code. Use your judgment!

