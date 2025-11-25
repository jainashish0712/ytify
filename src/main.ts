import './stylesheets/global.css';
import './scripts/i18n';
import './scripts/router';
import './scripts/audioEvents';
import './scripts/list';
import './scripts/search';
import './scripts/theme';

addEventListener('DOMContentLoaded', async () => {

  (await import('./modules/start')).default();
  (await import('./components/SuperCollectionList')).default();

  const settingsHandler = document.getElementById('settingsHandler');
  settingsHandler?.addEventListener('click', async () => {
    (await import('./components/Settings/index')).default();
  });

  const fullscreenToggle = document.getElementById('fullscreenBtn');
  fullscreenToggle?.addEventListener('click', () => {
    if (document.fullscreenElement)
      document.exitFullscreen();
    else
      document.documentElement.requestFullscreen();
  });

  /* ---------------------------------------------
       ADDED: Sync thumbnail → CSS blurred background
     --------------------------------------------- */
  function setCurrentThumb(url: string | null) {
    if (!url) {
      document.documentElement.style.removeProperty('--current-thumb');
      return;
    }
    document.documentElement.style.setProperty('--current-thumb', `url("${url}")`);
  }




const miniImg = document.getElementById('img') as HTMLImageElement | null;
if (miniImg) {
  function setCurrentThumb(url: string | null) {
    if (!url) document.documentElement.style.removeProperty('--current-thumb');
    else document.documentElement.style.setProperty('--current-thumb', `url("${url}")`);
  }
  miniImg.addEventListener('load', () => setCurrentThumb(miniImg.src || null));
  if (miniImg.src) setCurrentThumb(miniImg.src);
}

  // const miniImg = document.getElementById('img') as HTMLImageElement | null;
  // if (miniImg) {
  //   miniImg.addEventListener('load', () => setCurrentThumb(miniImg.src || null));

  //   if (miniImg.src) setCurrentThumb(miniImg.src);

  //   const mo = new MutationObserver(muts => {
  //     for (const m of muts) {
  //       if (m.type === 'attributes' && m.attributeName === 'src') {
  //         setCurrentThumb(miniImg.src || null);
  //       }
  //     }
  //   });
  //   mo.observe(miniImg, { attributes: true });
  // }
  /* --------------------------------------------- */



  if (import.meta.env.PROD)
    await import('virtual:pwa-register').then(pwa => {
      const handleUpdate = pwa.registerSW({
        onNeedRefresh() {
          const dialog = document.createElement('dialog') as HTMLDialogElement;
          dialog.addEventListener('click', (e) => {
            const elm = e.target as HTMLButtonElement;
            if (elm.id === 'updateBtn' || elm.closest('#updateBtn'))
              handleUpdate();
            if (elm.id === 'laterBtn' || elm.closest('#laterBtn')) {
              dialog.close();
              dialog.remove();
            }
          })

          import('./components/UpdatePrompt')
            .then(mod => mod.default(dialog))
            .then(() => document.body.appendChild(dialog));
        }
      });
    });

});
