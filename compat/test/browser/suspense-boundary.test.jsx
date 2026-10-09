import { setupRerender } from 'preact/test-utils';
import React, {
	createElement,
	render,
	Component,
	Suspense
} from 'preact/compat';
import { setupScratch, teardown } from '../../../test/_util/helpers';
import { createSuspenseLoader } from './suspense-utils';

const h = React.createElement;
/* eslint-env browser */

/**
 * Regression test for the Suspense boundary minification collision.
 *
 * Root cause: preact's mangle.json mapped multiple properties to `__c`,
 * including `_childDidSuspend`. In built output, the `_catchError` hook's
 * check `component._childDidSuspend` became `component.__c`, which falsely
 * matched any component with another `__c`-mangled property (e.g. `_id`,
 * `_cleanup`, `_component`, `_commit`).
 *
 * The fix gives `_childDidSuspend` a unique mangled name (`__D`).
 *
 * This test uses a component with `_id` (mangled to `__c`) between the
 * Suspense boundary and the thrower. In MINIFY mode:
 * - On main: the hook mistakes the fake for a Suspense boundary (false
 *   positive on `__c`), the promise is delivered to the wrong component,
 *   and the test fails.
 * - With the fix: the hook checks for `__D`, skips the fake, finds the
 *   real Suspense boundary, and the test passes.
 *
 * In source mode the test passes on both (no collision in source), but
 * documents the expected behavior.
 */
describe('suspense boundary detection', () => {
	/** @type {HTMLDivElement} */
	let scratch, rerender;

	beforeEach(() => {
		scratch = setupScratch();
		rerender = setupRerender();
	});

	afterEach(() => {
		teardown(scratch);
	});

	it('should not mistake a component with _id for a Suspense boundary', () => {
		const [useLoader, resolve] = createSuspenseLoader();

		function Loader() {
			const data = useLoader();
			return <div>data: {data}</div>;
		}

		// This component has `_id`, which mangle.json maps to `__c`.
		// On main's built output, the _catchError hook's `component.__c`
		// check falsely matches this, treating it as a Suspense boundary.
		class FakeBoundary extends Component {
			constructor(props) {
				super(props);
				// _id -> __c in built output (collides on main)
				this._id = 'fake-boundary';
			}
			render() {
				return <div class="fake">{this.props.children}</div>;
			}
		}

		render(
			<Suspense fallback={<div>loading...</div>}>
				<FakeBoundary>
					<Loader />
				</FakeBoundary>
			</Suspense>,
			scratch
		);
		rerender();

		// The real Suspense boundary must catch the promise, not the fake.
		// On main (MINIFY), the promise goes to FakeBoundary and this fails.
		expect(scratch.innerHTML).to.contain('loading...');

		return resolve('hello').then(() => {
			rerender();
			expect(scratch.innerHTML).to.contain('data: hello');
			expect(scratch.innerHTML).to.not.contain('loading...');
		});
	});

	it('should catch promise thrown through provider components', () => {
		const [useLoader, resolve] = createSuspenseLoader();

		function Loader() {
			const data = useLoader();
			return <div>data: {data}</div>;
		}

		function Provider(props) {
			return <div class="provider">{props.children}</div>;
		}

		render(
			<Provider>
				<Suspense fallback={<div>loading...</div>}>
					<Provider>
						<Loader />
					</Provider>
				</Suspense>
			</Provider>,
			scratch
		);
		rerender();

		expect(scratch.innerHTML).to.contain('loading...');

		return resolve('hello').then(() => {
			rerender();
			expect(scratch.innerHTML).to.contain('data: hello');
		});
	});

	it('should prefer the nearest Suspense boundary', () => {
		const [useLoader, resolve] = createSuspenseLoader();

		function Loader() {
			const data = useLoader();
			return <span>{data}</span>;
		}

		render(
			<Suspense fallback={<div>outer loading</div>}>
				<div>
					<Suspense fallback={<div>inner loading</div>}>
						<Loader />
					</Suspense>
				</div>
			</Suspense>,
			scratch
		);
		rerender();

		expect(scratch.innerHTML).to.contain('inner loading');
		expect(scratch.innerHTML).to.not.contain('outer loading');

		return resolve('done').then(() => {
			rerender();
			expect(scratch.textContent).to.contain('done');
		});
	});
});
