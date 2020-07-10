// @flow strict

import { SYMBOL_ASYNC_ITERATOR } from '../polyfills/symbols';

import type { Path } from '../jsutils/Path';
import type { ObjMap } from '../jsutils/ObjMap';
import type { PromiseOrValue } from '../jsutils/PromiseOrValue';
import { GraphQLError } from '../error/GraphQLError';
import { pathToArray, addPath } from '../jsutils/Path';
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
  path?: $ReadOnlyArray<string | number>,
  label?: string,
  extensions?: ObjMap<mixed>,
  hasNext: boolean,
|};

/**
 * Same as ExecutionPatchResult, but without hasNext
 */
type DispatcherResult = {|
  errors?: $ReadOnlyArray<GraphQLError>,
  data?: ObjMap<mixed> | mixed | null,
  path: $ReadOnlyArray<string | number>,
  label?: string,
  extensions?: ObjMap<mixed>,
|};

export type AsyncExecutionResult = ExecutionResult | ExecutionPatchResult;

export class Dispatcher {
  _subsequentPayloads: Array<Promise<IteratorResult<DispatcherResult, void>>>;
  _initialResult: ?ExecutionResult;
  _hasReturnedInitialResult: boolean;

  constructor() {
    this._subsequentPayloads = [];
    this._hasReturnedInitialResult = false;
  }

  hasSubsequentPayloads() {
    return this._subsequentPayloads.length !== 0;
  }

  add(
    label?: string,
    path?: Path,
    promiseOrData: PromiseOrValue<ObjMap<mixed> | mixed>,
    errors: Array<GraphQLError>,
  ): void {
    this._subsequentPayloads.push(
      getPromise(promiseOrData).then((data) => ({
        value: createPatchResult(data, label, path, errors),
        done: false,
      })),
    );
  }

  addAsyncIterable(
    label?: string,
    nextIndex: number,
    path?: Path,
    result: AsyncIterable<mixed>,
    completeValue: (mixed, Path, Array<GraphQLError>) => mixed,
    handleFieldError: (Error, Path, Array<GraphQLError>) => null,
  ): void {
    // $FlowFixMe
    const iteratorMethod = result[SYMBOL_ASYNC_ITERATOR];
    const iterator = iteratorMethod.call(result);
    let index = nextIndex;
    const handleNext = () => {
      const fieldPath = addPath(path, index);
      const patchErrors = [];
      this._subsequentPayloads.push(
        iterator.next().then(
          ({ value: data, done }) => {
            if (done && !data) {
              return { value: undefined, done };
            }
            index++;
            handleNext();
            return {
              value: createPatchResult(
                completeValue(data, fieldPath, patchErrors),
                label,
                fieldPath,
                patchErrors,
              ),
              done,
            };
          },
          (error) => {
            handleFieldError(error, fieldPath, patchErrors);
            return {
              value: createPatchResult(null, label, fieldPath, patchErrors),
              done: false,
            };
          },
        ),
      );
    };

    return handleNext();
  }

  _race(): Promise<IteratorResult<ExecutionPatchResult, void>> {
    return new Promise((resolve) => {
      this._subsequentPayloads.forEach((promise) => {
        promise.then(() => {
          // resolve with actual promise, not resolved value of promise
          // so we can remove it from this._subsequentPayloads
          resolve({ promise });
        });
      });
    })
      .then(({ promise }) => {
        this._subsequentPayloads.splice(
          this._subsequentPayloads.indexOf(promise),
          1,
        );
        return promise;
      })
      .then(({ value, done }) => {
        if (done && this._subsequentPayloads.length === 0) {
          // async iterable resolver just finished and no more pending payloads
          return {
            value: {
              hasNext: false,
            },
            done: false,
          };
        } else if (done) {
          // async iterable resolver just finished but there are pending payloads
          // return the next one
          return this._race();
        }
        const returnValue: ExecutionPatchResult = {
          ...value,
          hasNext: this._subsequentPayloads.length > 0,
        };
        return {
          value: returnValue,
          done: false,
        };
      });
  }

  _next(): Promise<IteratorResult<AsyncExecutionResult, void>> {
    if (!this._hasReturnedInitialResult) {
      this._hasReturnedInitialResult = true;
      return Promise.resolve({
        value: {
          ...this._initialResult,
          hasNext: true,
        },
        done: false,
      });
    } else if (this._subsequentPayloads.length === 0) {
      return Promise.resolve({ value: undefined, done: true });
    }
    return this._race();
  }

  get(initialResult: ExecutionResult): AsyncIterable<AsyncExecutionResult> {
    this._initialResult = initialResult;
    return ({
      [SYMBOL_ASYNC_ITERATOR]() {
        return this;
      },
      next: () => this._next(),
    }: any);
  }
}

function createPatchResult(
  data: ObjMap<mixed> | mixed | null,
  label?: string,
  path?: Path,
  errors?: $ReadOnlyArray<GraphQLError>,
): DispatcherResult {
  const value: DispatcherResult = {
    data,
    path: path ? pathToArray(path) : [],
  };

  if (label != null) {
    value.label = label;
  }

  if (errors && errors.length > 0) {
    value.errors = errors;
  }

  return value;
}

function getPromise(data: PromiseOrValue<mixed>): Promise<mixed> {
  if (isPromise(data)) {
    return data;
  }
  return Promise.resolve(data);
}
