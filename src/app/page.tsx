import {
  Header,
  HeroSection,
  FeaturesSection,
  ProductoSection,
  PasosSection,
  AboutSection,
  ContactSection,
  Footer,
} from '@/components';
import { HashScrollReset } from '@/components/HashScrollReset';

const Home = () => (
  <main>
    <HashScrollReset />
    <Header />
    <HeroSection />
    <FeaturesSection />
    <ProductoSection />
    <AboutSection />
    <PasosSection />
    <ContactSection />
    <Footer />
  </main>
);

export default Home;
