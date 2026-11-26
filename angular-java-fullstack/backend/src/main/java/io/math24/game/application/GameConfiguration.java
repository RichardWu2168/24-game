package io.math24.game.application;

import io.math24.game.domain.AnswerValidator;
import io.math24.game.domain.PuzzleGenerator;
import io.math24.game.domain.PuzzleSolver;
import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class GameConfiguration {
    @Bean
    public Clock gameClock() {
        return Clock.systemUTC();
    }

    @Bean
    public PuzzleGenerator puzzleGenerator() {
        return new PuzzleGenerator();
    }

    @Bean
    public PuzzleSolver puzzleSolver() {
        return new PuzzleSolver();
    }

    @Bean
    public AnswerValidator answerValidator() {
        return new AnswerValidator();
    }
}
