import React, { useState } from 'react';
import { motion } from 'motion/react';

interface GreetingPageProps {
  onSetName: (name: string) => void;
  key?: React.Key;
}

export function GreetingPage({ onSetName }: GreetingPageProps) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSetName(inputValue.trim());
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center pt-[30vh] font-['Roboto']"
    >
      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Моё имя"
          required
          autoComplete="off"
          className="w-[70vw] border-0 bg-transparent text-center text-[4vh] text-[#878568] outline-none placeholder:text-[#a3a289]"
        />
        <motion.button
          whileTap={{ scale: 0.95 }}
          type="submit"
          className="cursor-pointer text-[4vh] text-[#505143] underline decoration-solid"
        >
          Представиться
        </motion.button>
      </form>

      <motion.div
        initial={{ rotate: -15, opacity: 0, scale: 0.9 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
        className="mt-20 w-[60vw]"
      >
        <img
          src="https://cdn.glitch.global/c69c58fa-c944-4991-9024-718a4c5de33a/thumbnails%2Flogo.png"
          alt="Logo"
          className="w-full"
        />
      </motion.div>
    </motion.div>
  );
}
