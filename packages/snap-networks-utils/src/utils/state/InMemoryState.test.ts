import { InMemoryState } from './InMemoryState';

type MockStateValue = {
  users: { name: string; age?: number }[];
};

describe('InMemoryState', () => {
  it('gets, sets, and deletes keys', async () => {
    const state = new InMemoryState<MockStateValue>({
      users: [{ name: 'John', age: 30 }],
    });

    expect(await state.get()).toStrictEqual({
      users: [{ name: 'John', age: 30 }],
    });
    expect(await state.getKey('users.0.name')).toBe('John');

    await state.setKey('users.0.name', 'Jane');
    expect(await state.getKey('users.0.name')).toBe('Jane');

    await state.setKeyWith<number>('users.0.age', (age) => (age ?? 0) + 1);
    expect(await state.getKey('users.0.age')).toBe(31);

    await state.deleteKey('users.0.age');
    expect(await state.get()).toStrictEqual({ users: [{ name: 'Jane' }] });

    await state.deleteKeys(['users']);
    expect(await state.get()).toStrictEqual({});
  });

  it('replaces the whole state via update', async () => {
    const state = new InMemoryState<MockStateValue>({
      users: [{ name: 'John' }],
    });

    expect(
      await state.update(() => ({ users: [{ name: 'Bob', age: 50 }] })),
    ).toStrictEqual({ users: [{ name: 'Bob', age: 50 }] });
  });
});
