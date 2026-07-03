import {
  Header,
  HeroSection,
  FeaturesSection,
  AboutSection,
  ContactSection,
  Footer,
} from '@/components';
import { ProductoSection } from '@/components/ProductoSection';
import { HashScrollReset } from '@/components/HashScrollReset';

const Home = () => (
  <main>
    <HashScrollReset />
    <Header />
    <HeroSection />
    <FeaturesSection />
    <ProductoSection />
    {/* <HowWeDoItSection /> */}
    <AboutSection />
    <ContactSection />
    <Footer />
  </main>
);

export default Home;
