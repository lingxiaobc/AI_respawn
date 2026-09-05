import json
import tempfile
import unittest
from pathlib import Path
from finalize_resource import finalize


class FinalizeRecovery(unittest.TestCase):
    def fixture(self, directory):
        resource=directory/'resource-build-test';resource.mkdir()
        (directory/'resource-candidate.json').write_text(json.dumps({'resource':resource.name}))
        (directory/'static_locked_base.png').write_bytes(b'fixture-base')
        for name in ['manifest.json','preview.html','motion-preview.png','mouth-atlas.png','eyeLeft-atlas.png','eyeRight-atlas.png']:(resource/name).write_bytes(b'fixture')
        (resource/'final-audit.json').write_text(json.dumps({'outsideMaskChangedPixels':0,'atlasFramesChecked':63,'mouthGate':{'closed':True,'half':True,'open':True,'separation':True}}))
        (resource/'browser-qa.json').write_text(json.dumps({'pageErrors':[],'mobileHorizontalOverflow':False,'automaticAnimation':True,'stopClosesMouth':True,'localAudioAmplitudeAndSilence':True,'independentParameters':[{'outsideOwnRegion':0,'changedPixels':1}]*3}))
        return resource

    def test_existing_zip_resumes_without_rewriting(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);resource=self.fixture(root);finalize(root)
            archive=root/f'{resource.name}-review.zip';before=archive.read_bytes()
            (root/'resource-current.json').unlink() # Simulate crash before pointer/checkpoint publication.
            finalize(root)
            self.assertEqual(before,archive.read_bytes());self.assertTrue((root/'resource-current.json').is_file())

    def test_mismatched_archive_does_not_publish(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);resource=self.fixture(root);finalize(root)
            (root/'resource-current.json').unlink();(resource/'preview.html').write_bytes(b'changed')
            with self.assertRaises(ValueError):finalize(root)
            self.assertFalse((root/'resource-current.json').exists())
