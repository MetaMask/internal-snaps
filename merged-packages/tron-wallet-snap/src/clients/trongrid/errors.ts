export class TrongridAccountNotFoundError extends Error {
  constructor() {
    super('Account not found or no data returned');
    this.name = 'TrongridAccountNotFoundError';
  }
}
