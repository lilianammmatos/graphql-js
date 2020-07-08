// @flow strict

import { SYMBOL_ASYNC_ITERATOR } from '../polyfills/symbols';

import type { Path } from '../jsutils/Path';
import type { ObjMap } from '../jsutils/ObjMap';
import type { PromiseOrValue } from '../jsutils/PromiseOrValue';
import { GraphQLError } from '../error/GraphQLError';
import { pathToArray } from '../jsutils/Path';
import isPromise from '../jsutils/isPromise';

/**
 * The result of GraphQL execution.
 *
 *   - `errors` is included when any errors occurred as a non-empty array.
 *   - `data` is the result of a successful execution of the query.
 *   - `extensions` is reserved for adding non-standard properties.
 *   - `hasNext` is true if a future payload is expected.
 */
export type ExecutionResult = {|
  errors?: $ReadOnlyArray<GraphQLError>,
  data?: ObjMap<mixed> | null,
  extensions?: ObjMap<mixed>,
  hasNext?: boolean,
|};

/**
 * The result of an asynchronous GraphQL patch.
 *
 *   - `errors` is included when any errors occurred as a non-empty array.
 *   - `data` is the result of the additional asynchronous data.
 *   - `path` is the location of data.
 *   - `label` is the label provided to @defer or @stream.
 *   - `extensions` is reserved for adding non-standard properties.
 *   - `hasNext` is true if a future payload is expected.
 */
export type ExecutionPatchResult = {|
  errors?: $ReadOnlyArray<GraphQLError>,
  data?: ObjMap<mixed> | mixed | null,
  path: $ReadOnlyArray<string | number>,
  label?: string,
  extensions?: ObjMap<mixed>,
  hasNext?: boolean,
|};

export type AsyncExecutionResult = ExecutionResult | ExecutionPatchResult;

type DispatcherIteratorResultType = {|
  value: ExecutionPatchResult,
  done: boolean,
|};

export class Dispatcher {
  _patches: Array<Promise<DispatcherIteratorResultType>>;

  constructor() {
    this._patches = [];
  }

  getPromise(data: PromiseOrValue<mixed>): Promise<mixed> {
    if (isPromise(data)) {
      return data;
    }
    return Promise.resolve(data);
  }

  hasPatches() {
    return this._patches.length !== 0;
  }

  add(
    label?: string,
    path: Path | void,
    promiseOrData: PromiseOrValue<ObjMap<mixed> | mixed>,
    errors: Array<GraphQLError>,
  ) {
    this._patches.push(
      this.getPromise(promiseOrData).then((data) => {
        const value: $Shape<ExecutionPatchResult> = {
          data,
          path: pathToArray(path),
        };

        if (label != null) {
          value.label = label;
        }

        if (errors && errors.length > 0) {
          value.errors = errors;
        }

        return { value, done: false };
      }),
    );
  }

  get(initialResult: ExecutionResult): AsyncIterable<AsyncExecutionResult> {
    let hasReturnedInitialResult = false;
    const results = this._patches;

    function race(promises) {
      const hasNext = promises.length !== 1;
      return new Promise((resolve) => {
        promises.forEach((promise, index) => {
          promise.then((result) => {
            resolve({
              result: {
                ...result,
                value: {
                  ...result.value,
                  hasNext,
                },
              },
              index,
            });
          });
        });
      });
    }

    const getNext = (promises) => {
      if (!hasReturnedInitialResult) {
        hasReturnedInitialResult = true;
        return Promise.resolve({
          value: {
            ...initialResult,
            hasNext: true,
          },
          done: false,
        });
      } else if (promises.length === 0) {
        return Promise.resolve({ value: undefined, done: true });
      }
      return race(promises).then(({ result, index }) => {
        promises.splice(index, 1);
        return result;
      });
    };

    return ({
      next() {
        return getNext(results);
      },
      [SYMBOL_ASYNC_ITERATOR]() {
        return this;
      },
    }: any);
  }
}
