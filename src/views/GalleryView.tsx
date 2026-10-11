import { ImagesIcon } from "@phosphor-icons/react";
import { MediaGallery } from "../components/Media";
import { Page } from "../components/Shell";

export function GalleryView() {
  return (
    <Page
      wide
      title={
        <>
          <ImagesIcon className="text-brand-500" /> Media Gallery
        </>
      }
    >
      <MediaGallery />
    </Page>
  );
}
