// @flow strict

import { expect } from 'chai';
import { describe, it } from 'mocha';

import isAsyncIterable from '../jsutils/isAsyncIterable';
import { graphql } from '../graphql';

import {
  StarWarsSchema,
  StarWarsSchemaDeferStreamEnabled,
} from './starWarsSchema';

describe('Star Wars Query Stream Tests', () => {
  describe('Compatibility', () => {
    it('Should throw error if using @stream without enabling in the schema', async () => {
      const query = `
        query HeroFriendsQuery {
          hero {
            friends @stream(initialCount: 0, label: "HeroFriends") {
              id
              name
            }
          }
        }
      `;
      const result = await graphql(StarWarsSchema, query);
      expect(result).to.deep.equal({
        errors: [
          {
            message: 'Unknown directive "@stream".',
            locations: [{ line: 4, column: 21 }],
          },
        ],
      });
    });
    it('Can disable @stream using if argument', async () => {
      const query = `
        query HeroFriendsQuery {
          hero {
            friends @stream(initialCount: 0, label: "HeroFriends", if: false) {
              id
              name
            }
          }
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      expect(result).to.deep.equal({
        data: {
          hero: {
            friends: [
              {
                id: '1000',
                name: 'Luke Skywalker',
              },
              {
                id: '1002',
                name: 'Han Solo',
              },
              {
                id: '1003',
                name: 'Leia Organa',
              },
            ],
          },
        },
      });
    });
  });

  describe('@stream conflict validation', () => {
    it('Does not allow a mix of @stream and no @stream on the same field', async () => {
      const query = `
        query HeroFriendsQuery {
          hero {
            friends {
              id
            }
            ...FriendsName
          }
        }
        fragment FriendsName on Character {
          friends @stream(label: "nameLabel", initialCount: 1) {
            name
          }
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      expect(result).to.deep.equal({
        errors: [
          {
            message:
              'Fields "friends" conflict because they have differing stream directives. Use different aliases on the fields to fetch both if this was intentional.',
            locations: [
              {
                line: 4,
                column: 13,
              },
              {
                line: 11,
                column: 11,
              },
            ],
          },
        ],
      });
    });
    it('Does not allow multiple @stream with different initialCount', async () => {
      const query = `
        query HeroFriendsQuery {
          hero {
            friends @stream(label: "sameLabel", initialCount: 3) {
              id
            }
            ...FriendsName
          }
        }
        fragment FriendsName on Character {
          friends @stream(label: "sameLabel", initialCount: 1) {
            name
          }
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      expect(result).to.deep.equal({
        errors: [
          {
            message:
              'Fields "friends" conflict because they have differing stream directives. Use different aliases on the fields to fetch both if this was intentional.',
            locations: [
              {
                line: 4,
                column: 13,
              },
              {
                line: 11,
                column: 11,
              },
            ],
          },
        ],
      });
    });
    it('Does not allow multiple @stream with different label', async () => {
      const query = `
        query HeroFriendsQuery {
          hero {
            friends @stream(label: "idLabel", initialCount: 1) {
              id
            }
            ...FriendsName
          }
        }
        fragment FriendsName on Character {
          friends @stream(label: "nameLabel", initialCount: 1) {
            name
          }
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      expect(result).to.deep.equal({
        errors: [
          {
            message:
              'Fields "friends" conflict because they have differing stream directives. Use different aliases on the fields to fetch both if this was intentional.',
            locations: [
              {
                line: 4,
                column: 13,
              },
              {
                line: 11,
                column: 11,
              },
            ],
          },
        ],
      });
    });
    it('Does allow multiple @stream with same label and initialCount', async () => {
      const query = `
      query HeroFriendsQuery {
        hero {
          friends @stream(label: "sameLabel", initialCount: 2) {
            id
          }
          ...FriendsName
        }
      }
      fragment FriendsName on Character {
        friends @stream(label: "sameLabel", initialCount: 2) {
          name
        }
      }
    `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      const patches = [];

      /* istanbul ignore else */
      if (isAsyncIterable(result)) {
        for await (const patch of result) {
          patches.push(patch);
        }
      }
      expect(patches).to.have.lengthOf(2);
      expect(patches).to.deep.equal([
        {
          data: {
            hero: {
              friends: [
                {
                  id: '1000',
                  name: 'Luke Skywalker',
                },
                {
                  id: '1002',
                  name: 'Han Solo',
                },
              ],
            },
          },
          isFinal: false,
        },
        {
          data: {
            id: '1003',
            name: 'Leia Organa',
          },
          path: ['hero', 'friends', 2],
          label: 'sameLabel',
          isFinal: true,
        },
      ]);
    });
    it('Does allow multiple @stream with different label and initialCount when fields are aliased', async () => {
      const query = `
      query HeroFriendsQuery {
        hero {
          friends @stream(label: "idLabel", initialCount: 2) {
            id
          }
          ...FriendsName
        }
      }
      fragment FriendsName on Character {
        namedFriends: friends @stream(label: "nameLabel", initialCount: 1) {
          name
        }
      }
    `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      const patches = [];

      /* istanbul ignore else */
      if (isAsyncIterable(result)) {
        for await (const patch of result) {
          patches.push(patch);
        }
      }
      expect(patches).to.have.lengthOf(4);
      expect(patches).to.deep.equal([
        {
          data: {
            hero: {
              friends: [
                {
                  id: '1000',
                },
                {
                  id: '1002',
                },
              ],
              namedFriends: [
                {
                  name: 'Luke Skywalker',
                },
              ],
            },
          },
          isFinal: false,
        },
        {
          data: {
            id: '1003',
          },
          path: ['hero', 'friends', 2],
          label: 'idLabel',
          isFinal: false,
        },
        {
          data: {
            name: 'Han Solo',
          },
          path: ['hero', 'namedFriends', 1],
          label: 'nameLabel',
          isFinal: false,
        },
        {
          data: {
            name: 'Leia Organa',
          },
          path: ['hero', 'namedFriends', 2],
          label: 'nameLabel',
          isFinal: true,
        },
      ]);
    });
  });
  describe('Basic Queries', () => {
    it('Can @stream an array field', async () => {
      const query = `
        query HeroFriendsQuery {
          hero {
            friends @stream(initialCount: 2, label: "HeroFriends") {
              id
              name
            }
          }
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      const patches = [];

      /* istanbul ignore else */
      if (isAsyncIterable(result)) {
        for await (const patch of result) {
          patches.push(patch);
        }
      }

      expect(patches).to.have.lengthOf(2);
      expect(patches).to.deep.equal([
        {
          data: {
            hero: {
              friends: [
                {
                  id: '1000',
                  name: 'Luke Skywalker',
                },
                {
                  id: '1002',
                  name: 'Han Solo',
                },
              ],
            },
          },
          isFinal: false,
        },
        {
          label: 'HeroFriends',
          path: ['hero', 'friends', 2],
          data: {
            id: '1003',
            name: 'Leia Organa',
          },
          isFinal: true,
        },
      ]);
    });
    it('Errors are added to the correct patch', async () => {
      const query = `
        query HeroFriendsQuery {
          hero {
            friends @stream(initialCount: 0, label: "HeroFriends") {
              ... on Human {
                secretFriend
              }
            }
          }
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      const patches = [];

      /* istanbul ignore else */
      if (isAsyncIterable(result)) {
        for await (const patch of result) {
          patches.push(patch);
        }
      }

      expect(patches).to.have.lengthOf(4);
      expect(patches).to.deep.equal([
        {
          data: {
            hero: {
              friends: [],
            },
          },
          isFinal: false,
        },
        {
          data: {
            secretFriend: null,
          },
          path: ['hero', 'friends', 0],
          label: 'HeroFriends',
          errors: [
            {
              message: 'secretFriend is secret.',
              locations: [
                {
                  line: 6,
                  column: 17,
                },
              ],
              path: ['hero', 'friends', 0, 'secretFriend'],
            },
          ],
          isFinal: false,
        },
        {
          data: {
            secretFriend: null,
          },
          path: ['hero', 'friends', 1],
          label: 'HeroFriends',
          errors: [
            {
              message: 'secretFriend is secret.',
              locations: [
                {
                  line: 6,
                  column: 17,
                },
              ],
              path: ['hero', 'friends', 1, 'secretFriend'],
            },
          ],
          isFinal: false,
        },
        {
          data: {
            secretFriend: null,
          },
          path: ['hero', 'friends', 2],
          label: 'HeroFriends',
          errors: [
            {
              message: 'secretFriend is secret.',
              locations: [
                {
                  line: 6,
                  column: 17,
                },
              ],
              path: ['hero', 'friends', 2, 'secretFriend'],
            },
          ],
          isFinal: true,
        },
      ]);
    });
  });
});
