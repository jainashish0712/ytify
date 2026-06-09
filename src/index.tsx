/* @refresh reload */

import { For, lazy, onMount, Show } from 'solid-js';
import { render, Dynamic } from 'solid-js/web';
import { themer, syncLibrary } from '@utils';
import NavBar from '@components/NavBar.tsx';
import { updateLang, setStore, store, navStore, playerStore } from '@stores';
import './styles/global.css';

updateLang().then(() => {
  themer();

  render(() => (
    <App />
  ), document.body);
});



const MiniPlayer = lazy(() => import('@components/MiniPlayer'));
const ActionsMenu = lazy(() => import('@components/ActionsMenu'));
const SnackBar = lazy(() => import('@components/SnackBar'));

export default function App() {

  onMount(async () => {
    await import('@modules/start.ts').then(mod => mod.default());

    setStore('syncState', 'synced');
    syncLibrary('init');
  });

  return (
    <>
      <main>
        <Show when={navStore.queue.state}>
          <Dynamic component={navStore.queue.component} />
        </Show>
        <Show when={navStore.player.state}>
          <Dynamic component={navStore.player.component} />
        </Show>
        <Show when={navStore.search.state}>
          <Dynamic component={navStore.search.component} />
        </Show>
        <Show when={navStore.library.state}>
          <Dynamic component={navStore.library.component} />
        </Show>
        <Show when={navStore.list.state}>
          <Dynamic component={navStore.list.component} />
        </Show>
        <Show when={navStore.settings.state}>
          <Dynamic component={navStore.settings.component} />
        </Show>
        <Show when={navStore.equalizer.state}>
          <Dynamic component={navStore.equalizer.component} />
        </Show>
      </main>
      <footer>
        <Show when={!navStore.player.state && playerStore.playbackState !== 'none'}>
          <MiniPlayer />
        </Show >
        <NavBar />
      </footer>
      <Show when={store.actionsMenu?.id}>
        <ActionsMenu />
      </Show>
      <Show when={store.snackbar}>
        <SnackBar />
      </Show>
    </>
  );
}
