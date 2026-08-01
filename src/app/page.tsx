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
import { MotionProvider } from '@/components/MotionProvider';

const Home = () => (
  <MotionProvider>
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
  </MotionProvider>
);

export default Home;
