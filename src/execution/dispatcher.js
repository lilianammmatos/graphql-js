// @flow strict

import { SYMBOL_ASYNC_ITERATOR } from '../polyfills/symbols';

import { type Path, pathToArray, addPath } from '../jsutils/Path';
import { type ObjMap } from '../jsutils/ObjMap';
import { type PromiseOrValue } from '../jsutils/PromiseOrValue';
import { GraphQLError } from '../error/GraphQLError';
import isPromise from '../jsutils/isPromise';

const END_OF_ITERABLE = '@@END_OF_ITERABLE';

/**
 * The result of GraphQL execution.
 *
 *   - `errors` is included when any errors occurred as a non-empty array.
 *   - `data` is the result of a successful execution of the query.
 *   - `hasNext` is true if a future payload is expected.
 */
export type ExecutionResult = {|
  errors?: $ReadOnlyArray<GraphQLError>,
  data?: ObjMap<mixed> | null,
  hasNext?: boolean,
|};

/**
 * The result of an asynchronous GraphQL patch.
 *
 *   - `errors` is included when any errors occurred as a non-empty array.
 *   - `data` is the result of the additional asynchronous data.
 *   - `path` is the location of data.
 *   - `label` is the label provided to @defer or @stream.
 *   - `hasNext` is true if a future payload is expected.
 */
export type ExecutionPatchResult = {|
  errors?: $ReadOnlyArray<GraphQLError>,
  data?: ObjMap<mixed> | mixed | null,
  path: $ReadOnlyArray<string | number>,
  label: string,
  hasNext?: boolean,
|};

export type AsyncExecutionResult = ExecutionResult | ExecutionPatchResult;

type DispatcherIteratorResultType = {|
  value: ExecutionPatchResult,
  done: boolean,
|};

type PatchInfo = {|
  result?: PromiseOrValue<mixed>,
  type: 'promise' | 'asyncIterable',
  path: $ReadOnlyArray<string | number>,
  label: string,
  errors?: $ReadOnlyArray<GraphQLError>,
|};

export class Dispatcher {
  _patches: Array<PatchInfo>;

  constructor() {
    this._patches = [];
    this._hasNext = true;
    this._hasReturnedInitialResult = false;
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
    label: string,
    path: Path | void,
    promiseOrData: PromiseOrValue<ObjMap<mixed> | mixed>,
    errors: Array<GraphQLError>,
  ) {
    this._patches.push({
      result,
    });
    const patch = this.getPromise(promiseOrData).then((data) => {
      const value: $Shape<ExecutionPatchResult> = {
        data,
        path: pathToArray(path),
        label,
        ...(errors && errors.length > 0 ? { errors } : {}),
      };

      return { value, done: false };
    });
    this._patches.push(patch);
    return () => {
      const index = this._patches.indexOf(patch);
      if (index > -1) {
        console.log('splicing');
        this._patches.splice(index, 1);
      }
    };
  }

  addAsyncIterable(
    label: string,
    nextIndex: number,
    path: Path | void,
    result: AsyncIterable<mixed>,
    completeValue: (mixed, Path, Array<GraphQLError>) => mixed,
    handleFieldError: (Error, Path, Array<GraphQLError>) => null,
  ) {
    // $FlowFixMe
    const iteratorMethod = result[SYMBOL_ASYNC_ITERATOR];
    const iterator = iteratorMethod.call(result);
    let index = nextIndex;
    const handleNext = () => {
      const fieldPath = addPath(path, index);
      const patchErrors = [];
      const removePatch = this.add(
        label,
        fieldPath,
        iterator.next().then(
          ({ value, done }) => {
            if (done) {
              removePatch();
              return;
            }
            index++;
            handleNext();
            return completeValue(value, fieldPath, patchErrors);
          },
          (error) => {
            handleFieldError(error, fieldPath, patchErrors);
            this.add(label, fieldPath, null, patchErrors);
          },
        ),
        patchErrors,
      );
    };

    return handleNext();
  }

  race() {
    console.log('promises.length', this._patches.length);
    if (!this._patches.length) {
      console.log('returning final empty patch');
      this._hasNext = false;
      return Promise.resolve({ value: { hasNext: false }, done: true });
    }
    return new Promise((resolve) => {
      this._patches.forEach((promise, index) => {
        promise.then((result) => {
          console.log('resolving');
          this._hasNext = this._patches.length !== 1;
          resolve({
            result: {
              ...result,
              value: {
                ...result.value,
                hasNext: this._hasNext,
              },
            },
            index,
          });
        });
      });
    }).then(({ result, index }) => {
      this._patches.splice(index, 1);
      return result;
    });
  }

  getNext() {
    if (!this._hasReturnedInitialResult) {
      this._hasReturnedInitialResult = true;
      if (isPromise(this._initialResult)) {
        return this._initialResult.then((value) => ({
          value: {
            ...value,
            hasNext: true,
          },
          done: false,
        }));
      }
      return Promise.resolve({
        value: {
          ...this._initialResult,
          hasNext: true,
        },
        done: false,
      });
    } else if (this._patches.length === 0 && !this._hasNext) {
      return Promise.resolve({ value: undefined, done: true });
    }
    return this.race(this._patches);
  }

  get(
    initialResult: PromiseOrValue<ExecutionResult>,
  ): AsyncIterator<AsyncExecutionResult> {
    this._initialResult = initialResult;
    return ({
      next: () => this.getNext(),
      [SYMBOL_ASYNC_ITERATOR]() {
        return this;
      },
    }: any);
  }
}
