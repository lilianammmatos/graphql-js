// @flow strict

import { forAwaitEach, isAsyncIterable } from 'iterall';
import { expect } from 'chai';
import { describe, it } from 'mocha';

import { graphql } from '../graphql';

import {
  StarWarsSchema,
  StarWarsSchemaDeferStreamEnabled,
} from './starWarsSchema';

describe('Star Wars Query Stream Tests', () => {
  describe('Compatibility', () => {
    it('Can disable @stream and return would-be streamed data as part of initial result', async () => {
      const query = `
        query HeroFriendsQuery {
          hero {
            friends @stream(initial_count: 0, label: "HeroFriends") {
              id
              name
            }
          }
        }
      `;
      const result = await graphql(StarWarsSchema, query);
      expect(isAsyncIterable(result)).to.equal(false);
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
    it('Can disable @stream using if argument', async () => {
      const query = `
        query HeroFriendsQuery {
          hero {
            friends @stream(initial_count: 0, label: "HeroFriends", if: false) {
              id
              name
            }
          }
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      expect(isAsyncIterable(result)).to.equal(false);
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

  describe('Basic Queries', () => {
    it('Can @stream an array field', async () => {
      const query = `
        query HeroFriendsQuery {
          hero {
            friends @stream(initial_count: 2, label: "HeroFriends") {
              id
              name
            }
          }
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      expect(isAsyncIterable(result)).to.equal(true);
      const results = [];
      await forAwaitEach(result, patch => {
        results.push(patch);
      });
      expect(results).to.have.lengthOf(2);
      expect(results[0]).to.deep.equal({
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
      });

      expect(results[1]).to.deep.equal({
        label: 'HeroFriends',
        path: ['hero', 'friends', 2],
        data: {
          id: '1003',
          name: 'Leia Organa',
        },
      });
    });
    it('Can @stream multiple selections on the same field', async () => {
      const query = `
        query HeroFriendsQuery {
          hero {
            friends {
              id
            }
            ...FriendsName
            ...FriendsAppearsIn
          }
        }
        fragment FriendsName on Character {
          friends @stream(label: "nameLabel", initial_count: 1) {
            name
          }
        }
        fragment FriendsAppearsIn on Character {
          friends @stream(label: "appearsInLabel", initial_count: 2)  {
            appearsIn
          }
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      expect(isAsyncIterable(result)).to.equal(true);
      const results = [];
      await forAwaitEach(result, patch => {
        results.push(patch);
      });
      expect(results).to.have.lengthOf(4);
      expect(results[0]).to.deep.equal({
        data: {
          hero: {
            friends: [
              {
                id: '1000',
                appearsIn: ['NEW_HOPE', 'EMPIRE', 'JEDI'],
                name: 'Luke Skywalker',
              },
              {
                id: '1002',
                appearsIn: ['NEW_HOPE', 'EMPIRE', 'JEDI'],
              },
              {
                id: '1003',
              },
            ],
          },
        },
      });

      expect(results[1]).to.deep.equal({
        data: {
          name: 'Han Solo',
        },
        path: ['hero', 'friends', 1],
        label: 'nameLabel',
      });

      expect(results[2]).to.deep.equal({
        data: {
          name: 'Leia Organa',
        },
        path: ['hero', 'friends', 2],
        label: 'nameLabel',
      });

      expect(results[3]).to.deep.equal({
        data: {
          appearsIn: ['NEW_HOPE', 'EMPIRE', 'JEDI'],
        },
        path: ['hero', 'friends', 2],
        label: 'appearsInLabel',
      });
    });
  });
});
