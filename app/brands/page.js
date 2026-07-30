import { headers } from 'next/headers';
import BrandsList from '../../components/BrandsList.jsx';

export default async function BrandsPage() {
  const hostname = (await headers()).get('host') || '';
  const showTaxonomyNav = !hostname.startsWith('brands.');

  return <BrandsList showTaxonomyNav={showTaxonomyNav} />;
}
