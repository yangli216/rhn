import copy
import unittest
from build_essential_drugs import build_catalog, forms, norm, split_top, stable_id, strength, validate, specification_alternatives
from extract_essential_source import split_western_name

class StandardCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.catalog, cls.rows = build_catalog()

    def specs(self, code):
        return [x for x in self.catalog['specifications'] if x['legacyCode']==code]

    def test_amoxicillin_splits_all_four_forms_and_two_strengths(self):
        specs=self.specs('MED-2026-W006')
        self.assertEqual(8,len(specs))
        self.assertEqual({'TABLET','CAPSULE','GRANULE','DRY_SUSPENSION'},{s['doseForm'] for s in specs})
        self.assertEqual({'0.125','0.25'},{s['strength']['numerator']['value'] for s in specs})

    def test_amikacin_volume_is_denominator_not_drug_mass(self):
        specs=self.specs('MED-2026-W016')
        self.assertEqual(2,len(specs))
        self.assertEqual({'0.1','0.2'},{s['strength']['numerator']['value'] for s in specs})
        self.assertTrue(all(s['strength']['numerator']['unit']=='g' for s in specs))
        self.assertEqual({'1','2'},{s['strength']['denominator']['value'] for s in specs})

    def test_benzathine_peniciilin_has_no_invented_route_or_frequency(self):
        specs=self.specs('MED-2026-W002')
        self.assertEqual(2,len(specs))
        self.assertEqual({'60','120'},{s['strength']['numerator']['value'] for s in specs})
        self.assertTrue(all(s['clinicalAttributes']['defaultRoute'] is None for s in specs))
        self.assertTrue(all(s['clinicalAttributes']['defaultFrequency'] is None for s in specs))

    def test_compound_retains_both_quantities_without_claiming_ingredient_mapping(self):
        s=strength('125mg:31.25mg(4:1)(阿莫西林:克拉维酸)','WESTERN')
        self.assertEqual('MULTI_COMPONENT',s['kind'])
        self.assertEqual(['125','31.25'],[x['value'] for x in s['components']])
        self.assertFalse(s['computable'])
        self.assertIsNone(s['numerator'])

    def test_vitamins_keep_letter_and_number(self):
        values=[split_western_name('x',f'维生素 {x} Vitamin {x}')[0] for x in ['B1','B2','B6','B12','K1','C','D2']]
        self.assertEqual(7,len(set(values)))
        self.assertIn('维生素B12',values)

    def test_scope_entries_are_not_fabricated_as_tablets(self):
        scopes=[x for x in self.catalog['entries'] if x['entryType']=='SCOPE']
        self.assertEqual(7,len(scopes))
        self.assertTrue(all(not self.specs(x['legacyCode']) for x in scopes))
        self.assertTrue(all(x['sourceNoteLocation'] for x in scopes))

    def test_drug_name_suffixes_are_not_moved_to_inn(self):
        self.assertEqual(('两性霉素B', 'Amphotericin B'),
                         split_western_name('39', '两性霉素 B\nAmphotericin B'))
        self.assertEqual(('碳酸钙D3', 'Calcium Carbonate and Vitamin D3'),
                         split_western_name('345', '碳酸钙 D3 Calcium Carbonate and Vitamin D3'))
        by_code = {x['legacyCode']: x for x in self.catalog['entries']}
        self.assertEqual('两性霉素B', by_code['MED-2026-W039']['name'])
        self.assertEqual('碳酸钙D3', by_code['MED-2026-W345']['name'])

    def test_ingredient_list_is_one_composition_not_four_specs(self):
        specs=self.specs('MED-2026-W214')
        self.assertEqual(1,len(specs))
        self.assertIn('那可丁',specs[0]['specification'])
        self.assertIn('氨茶碱',specs[0]['specification'])
        self.assertFalse(specs[0]['strength']['computable'])

    def test_traditional_presentation_context_is_carried_to_alternatives(self):
        self.assertEqual(['每袋装6g','每袋装9g'],specification_alternatives('每袋装6g、9g'))

    def test_all_source_rows_retained_and_coverage_not_lost(self):
        self.assertEqual(816,len(self.rows))
        self.assertEqual(816,sum(len(x['sourceLocations']) for x in self.catalog['entries']))
        validate(self.catalog)

    def test_published_source_status_not_inferred_from_file_title(self):
        self.assertEqual('UNVERIFIED',self.catalog['source']['verificationStatus'])
        self.assertEqual('VERIFIED', self.catalog['source']['publicationVerificationStatus'])
        self.assertEqual('2026-09-01', self.catalog['source']['effectiveFrom'])
        self.assertIn('gov.cn', self.catalog['source']['officialUrl'])
        self.assertEqual(64, len(self.catalog['source']['officialAttachmentSha256']))

    def test_no_inferred_clinical_attributes_and_no_orderable_rows(self):
        for spec in self.catalog['specifications']:
            self.assertFalse(spec['orderable'])
            self.assertTrue(all(value is None for value in spec['clinicalAttributes'].values()))

    def test_release_and_salt_qualifiers_not_collapsed(self):
        result=forms('(钠盐)注射用无菌粉末')
        self.assertEqual('钠盐',result[0]['substanceQualifier'])
        self.assertIsNone(result[0]['presentationUnit'])
        self.assertIsNone(forms('颗粒剂')[0]['presentationUnit'])
        self.assertIsNone(forms('缓释颗粒')[0]['presentationUnit'])
        self.assertNotEqual(forms('片剂')[0]['doseForm'],forms('缓释片')[0]['doseForm'])
        self.assertEqual(2,len(forms('肠溶(片剂、胶囊)')))
        self.assertEqual([],forms('人胰岛素注射液(短效、中效和预混30R)'))

    def test_parenthetical_alternative_list_stays_with_specification(self):
        self.assertEqual(2,len(split_top('1g(含甲、乙)、2g','、')))

    def test_percentage_and_traditional_weights_are_not_drug_mass(self):
        self.assertFalse(strength('5%','WESTERN')['computable'])
        self.assertFalse(strength('每丸重9g','CHINESE_PATENT')['computable'])
        self.assertEqual('PRESENTATION_VOLUME',strength('10ml','WESTERN')['kind'])

    def test_unknown_and_malformed_specs_are_not_guessed(self):
        for spec in ['', '以说明书为准','每揿约100ug','0mg','1-2g']:
            self.assertFalse(strength(spec,'WESTERN')['computable'])
        self.assertEqual([],forms('未知剂型'))

    def test_identity_is_stable_under_ocr_spaces_and_not_edition_dependent(self):
        self.assertEqual(norm('0. 125 g'),norm('0.125g'))
        self.assertIn('D3 200', norm('维生素 D3 200 国际单位'))
        self.assertFalse(strength('1 000mg', 'WESTERN')['computable'])
        self.assertEqual(stable_id('STD-','阿莫西林','片剂','0. 125 g'),stable_id('STD-','阿莫西林','片剂','0.125g'))

    def test_invalid_duplicate_and_orderable_entries_fail_validation(self):
        value=copy.deepcopy(self.catalog)
        value['specifications'].append(copy.deepcopy(value['specifications'][0]))
        with self.assertRaises(AssertionError):validate(value)
        value=copy.deepcopy(self.catalog)
        value['specifications'][0]['orderable']=True
        with self.assertRaises(AssertionError):validate(value)

if __name__=='__main__':unittest.main()
