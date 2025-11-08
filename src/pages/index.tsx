import React from 'react';
import {
  Header,
  HeroSection,
  FeaturesSection,
  HowWeDoItSection,
  AboutSection,
  ContactSection,
  Footer,
} from '@/components';

export default function Home() {
  return (
    <main>
      <Header />
      <HeroSection />
      <FeaturesSection />
      <HowWeDoItSection />
      <AboutSection />
      <ContactSection />
      <Footer />
    </main>
  );
}
