import { setupRerender } from 'preact/test-utils';
import React, {
	createElement,
	render,
	Component,
	Suspense,
	createContext
} from 'preact/compat';
import { setupScratch, teardown } from '../../../test/_util/helpers';
import { createSuspenseLoader } from './suspense-utils';

const h = React.createElement;
/* eslint-env browser */

/**
 * App-level behavior tests for Suspense boundary detection.
 *
 * These verify that when a promise is thrown deep in the component tree,
 * the nearest Suspense boundary correctly catches it — even when intermediate
 * components (providers, routers, etc.) sit between the thrower and the
 * boundary. This is the scenario from real apps using data-fetching
 * libraries like TanStack Query with useSuspenseQuery.
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

	it('should catch promise thrown through provider components', () => {
		const Ctx = createContext(null);
		const [useLoader, resolve] = createSuspenseLoader();

		function Loader() {
			const data = useLoader();
			return <div>data: {data}</div>;
		}

		function Provider(props) {
			return (
				<Ctx.Provider value={{}}>
					<div class="provider">{props.children}</div>
				</Ctx.Provider>
			);
		}

		function Router(props) {
			return <div class="router">{props.children}</div>;
		}

		function Route(props) {
			return <div class="route">{props.children}</div>;
		}

		render(
			<Provider>
				<Suspense fallback={<div>loading...</div>}>
					<Router>
						<Route>
							<Loader />
						</Route>
					</Router>
				</Suspense>
			</Provider>,
			scratch
		);
		rerender();

		// Fallback should show while suspended
		expect(scratch.innerHTML).to.contain('loading...');

		return resolve('hello').then(() => {
			rerender();
			expect(scratch.innerHTML).to.contain('data: hello');
			expect(scratch.innerHTML).to.not.contain('loading...');
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

		// Inner boundary should catch, not outer
		expect(scratch.innerHTML).to.contain('inner loading');
		expect(scratch.innerHTML).to.not.contain('outer loading');

		return resolve('done').then(() => {
			rerender();
			expect(scratch.textContent).to.contain('done');
		});
	});

	it('should retry the suspender after promise resolves', () => {
		const [useLoader, resolve] = createSuspenseLoader();
		let renderCount = 0;

		function Loader() {
			renderCount++;
			const data = useLoader();
			return <div>{data} (renders: {renderCount})</div>;
		}

		render(
			<Suspense fallback={<div>waiting...</div>}>
				<Loader />
			</Suspense>,
			scratch
		);
		rerender();

		const firstRenderCount = renderCount;
		expect(scratch.innerHTML).to.contain('waiting...');

		return resolve('result').then(() => {
			rerender();
			// Suspender should have re-rendered after resolve
			expect(renderCount).to.be.greaterThan(firstRenderCount);
			expect(scratch.innerHTML).to.contain('result');
		});
	});
});
