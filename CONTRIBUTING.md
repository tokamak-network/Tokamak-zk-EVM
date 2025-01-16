# Contributing to Tokamak-zk-EVM

Thank you for your interest in contributing to Tokamak-zk-EVM! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/tokamak-zk-evm.git
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/tokamak-network/tokamak-zk-evm.git
   ```

## Development Workflow

1. Create a new branch from `dev`:
   ```bash
   git checkout dev
   git pull upstream dev
   git checkout -b feature/your-feature
   ```

2. Make your changes following our coding conventions

3. Commit your changes:
   ```bash
   git commit -m "feat: add new feature"
   ```
   
   We use conventional commits with the following types:
   - `feat`: New feature
   - `fix`: Bug fix
   - `docs`: Documentation changes
   - `chore`: Maintenance tasks
   - `test`: Adding or updating tests
   - `refactor`: Code refactoring

4. Push to your fork:
   ```bash
   git push origin feature/your-feature
   ```

5. Open a Pull Request

## Pull Request Guidelines

- PRs should be made against the `dev` branch
- Include a clear description of the changes
- Update relevant documentation
- Add or update tests as needed
- Ensure all tests pass
- Follow existing code style

## Code Style

- Use consistent naming conventions
- Write clear comments and documentation
- Follow language-specific conventions:
  - Rust: Follow `rustfmt` guidelines
  - Solidity: Follow Solidity style guide
  - TypeScript: Use prettier and eslint configurations

## Testing

- Write unit tests for new features
- Ensure all tests pass before submitting PR
- Include integration tests where appropriate

## Questions or Problems?

- Open an issue for bugs
- Join our [Discord](https://discord.gg/tokamak) for questions
- Check existing issues and PRs before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the project's [MPL-2.0 License](./LICENSE). 